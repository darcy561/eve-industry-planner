package jobdocuments

import (
	"bytes"
	"strings"
	"testing"

	"encoding/json/jsontext"

	"eve-industry-planner/shared/crypto/entityid"
	"eve-industry-planner/shared/jobidentity"
	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"
)

func writeBody(document string) models.JobWriteBody {
	return models.JobWriteBody{
		JobID:    "job-1",
		Revision: 4,
		Document: jsontext.Value(document),
	}
}

func TestDecodeJobWriteNamesTheJobFromTheEnvelope(t *testing.T) {
	job, err := decodeJobWrite(writeBody(`{"name":"A job"}`))
	if err != nil {
		t.Fatalf("decodeJobWrite: %v", err)
	}

	if job.JobID != "job-1" {
		t.Errorf("want the envelope's job id, got %q", job.JobID)
	}
	if job.Name != "A job" {
		t.Errorf("want the document's values, got %q", job.Name)
	}
}

func TestDecodeJobWriteRefusesAMemberTheModelDoesNotCarry(t *testing.T) {
	_, err := decodeJobWrite(writeBody(`{"somethingElse":1}`))
	if err == nil || !strings.Contains(err.Error(), "job-1") {
		t.Fatalf("want the write refused and named, got %v", err)
	}
}

func TestFieldWriteForCarriesTheFieldsAndTheRowsThatWent(t *testing.T) {
	body := writeBody(`{"build":{"materials":{"34":{"volume":1.5}}}}`)
	body.Removed = [][]string{{"esi", "industryJobs", "500001"}}
	job, err := decodeJobWrite(body)
	if err != nil {
		t.Fatalf("decodeJobWrite: %v", err)
	}

	write, err := fieldWriteFor(body, job)
	if err != nil {
		t.Fatalf("fieldWriteFor: %v", err)
	}

	if write.JobID != "job-1" || write.Expected != 4 {
		t.Errorf("want the write checked against what it read, got %+v", write)
	}
	if _, named := write.Fields["build.materials.34.volume"]; !named {
		t.Errorf("want the changed field carried, got %v", write.Fields)
	}
	if len(write.Cleared) != 1 || write.Cleared[0] != "esi.industryJobs.500001" {
		t.Errorf("want the row cleared, got %v", write.Cleared)
	}
}

func TestFieldWriteForRestatesTheSchemaVersion(t *testing.T) {
	body := writeBody(`{"name":"A job"}`)
	job, err := decodeJobWrite(body)
	if err != nil {
		t.Fatalf("decodeJobWrite: %v", err)
	}

	write, err := fieldWriteFor(body, job)
	if err != nil {
		t.Fatalf("fieldWriteFor: %v", err)
	}

	if write.Fields[models.JobSchemaVersionPath] != models.JobSchemaCurrent {
		t.Errorf("want the shape restated, got %v", write.Fields)
	}
}

func TestFieldWriteForRefusesARemovalThatLeavesTheModel(t *testing.T) {
	body := writeBody(`{"name":"A job"}`)
	body.Removed = [][]string{{"_meta", "revision"}}
	job, err := decodeJobWrite(body)
	if err != nil {
		t.Fatalf("decodeJobWrite: %v", err)
	}

	if _, err := fieldWriteFor(body, job); err == nil {
		t.Fatal("want a removal into _meta refused")
	}
}

func TestDecodeJobWriteKeepsTheEnvelopesJobOverTheDocuments(t *testing.T) {
	body := writeBody(`{"jobID":"another-job","name":"A job"}`)

	job, err := decodeJobWrite(body)
	if err != nil {
		t.Fatalf("decodeJobWrite: %v", err)
	}
	if job.JobID != "job-1" {
		t.Fatalf("want the envelope's job, got %q", job.JobID)
	}

	write, err := fieldWriteFor(body, job)
	if err != nil {
		t.Fatalf("fieldWriteFor: %v", err)
	}
	if write.JobID != "job-1" {
		t.Errorf("want the write aimed at the envelope's job, got %q", write.JobID)
	}
	if write.Fields["jobID"] != "job-1" {
		t.Errorf("want the stored job id to stay its own, got %v", write.Fields["jobID"])
	}
}

func TestFieldWriteForRestatesTheSchemaVersionOverAStaleOne(t *testing.T) {
	body := writeBody(`{"schemaVersion":0,"name":"A job"}`)
	job, err := decodeJobWrite(body)
	if err != nil {
		t.Fatalf("decodeJobWrite: %v", err)
	}

	write, err := fieldWriteFor(body, job)
	if err != nil {
		t.Fatalf("fieldWriteFor: %v", err)
	}
	if write.Fields[models.JobSchemaVersionPath] != models.JobSchemaCurrent {
		t.Errorf("want the current shape stated, got %v", write.Fields[models.JobSchemaVersionPath])
	}
}

func envelope(jobID string, revision int64, document string) models.JobWriteBody {
	return models.JobWriteBody{
		JobID:    jobID,
		Revision: revision,
		Document: jsontext.Value(document),
	}
}

func readAll(t *testing.T, bodies []models.JobWriteBody) []readJobWrite {
	t.Helper()
	read := make([]readJobWrite, 0, len(bodies))
	for _, body := range bodies {
		job, err := decodeJobWrite(body)
		if err != nil {
			t.Fatalf("decodeJobWrite %s: %v", body.JobID, err)
		}
		read = append(read, readJobWrite{Body: body, Job: *job})
	}
	return read
}

func TestSplitJobWritesSendsAWholeDocumentAndTheRestByField(t *testing.T) {
	bodies := []models.JobWriteBody{
		envelope("job-new", 0, `{"name":"A new job"}`),
		envelope("job-1", 4, `{"name":"A job"}`),
	}

	whole, fields, failed := splitJobWrites(readAll(t, bodies))

	if len(failed) != 0 {
		t.Fatalf("want none failed, got %v", failed)
	}
	if len(whole) != 1 || whole[0].JobID != "job-new" {
		t.Errorf("want the whole document carried, got %v", whole)
	}
	if len(fields) != 1 || fields[0].JobID != "job-1" || fields[0].Expected != 4 {
		t.Errorf("want the change carried by field, got %v", fields)
	}
}

func TestSplitJobWritesNamesOnlyTheWriteItCannotMake(t *testing.T) {
	bodies := []models.JobWriteBody{
		envelope("job-1", 4, `{"name":"A job"}`),
		envelope("job-bad", 4, `{"name":"A job"}`),
	}
	bodies[1].Removed = [][]string{{"name"}}

	_, fields, failed := splitJobWrites(readAll(t, bodies))

	if len(fields) != 1 || fields[0].JobID != "job-1" {
		t.Errorf("want the sound write still made, got %v", fields)
	}
	if len(failed) != 1 || failed[0] != "job-bad" {
		t.Errorf("want only the unsound write named, got %v", failed)
	}
}

func TestWrittenIDsLeavesOutEveryWriteThatMissed(t *testing.T) {
	writes := []eipmongo.JobFieldWrite{
		{JobID: "job-clean"}, {JobID: "job-moved"}, {JobID: "job-bad"},
	}

	written := writtenIDs(
		writes,
		func(write eipmongo.JobFieldWrite) string { return write.JobID },
		[]string{"job-bad"},
		[]eipmongo.RevisionConflict{{JobID: "job-moved"}},
	)

	if len(written) != 1 || written[0] != "job-clean" {
		t.Fatalf("want only the write that landed, got %v", written)
	}
}

func TestFieldWriteForCarriesACipheredRowAsTheCipherLeftIt(t *testing.T) {
	cipher, err := entityid.New(bytes.Repeat([]byte("k"), 32))
	if err != nil {
		t.Fatalf("entityid.New: %v", err)
	}

	body := writeBody(`{"esi":{"industryJobs":{"500001":{"job_id":500001,"character_id":99}}}}`)
	job, err := decodeJobWrite(body)
	if err != nil {
		t.Fatalf("decodeJobWrite: %v", err)
	}
	if err := jobidentity.Encrypt(job, cipher); err != nil {
		t.Fatalf("Encrypt: %v", err)
	}

	write, err := fieldWriteFor(body, job)
	if err != nil {
		t.Fatalf("fieldWriteFor: %v", err)
	}

	if _, named := write.Fields["esi.industryJobs.500001.character_id"]; named {
		t.Fatalf("character_id has no stored path and must not be written at one: %v", write.Fields)
	}
	run, ok := write.Fields["esi.industryJobs.500001"].(models.LinkedESIJob)
	if !ok {
		t.Fatalf("want the row carried whole, got %T", write.Fields["esi.industryJobs.500001"])
	}
	if run.CharacterRef == "" {
		t.Error("want the row carrying the ref the cipher made")
	}
	if run.CharacterID != 0 {
		t.Errorf("want the id the cipher cleared, got %d", run.CharacterID)
	}
}
