package jobdocuments

import (
	"fmt"

	"eve-industry-planner/shared/jsoncodec"
	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"
)

// decodeJobWrite reads the job a write carries.
//
// The typed decode is what bounds the body: a member the model does not carry
// is refused here, so neither the values written nor the paths derived from
// them can reach past the shape of a job.
func decodeJobWrite(body models.JobWriteBody) (*models.Job, error) {
	var job models.Job
	if err := jsoncodec.UnmarshalRequest(body.Document, &job); err != nil {
		return nil, fmt.Errorf("job write: %s carries a document this model cannot read: %w", body.JobID, err)
	}
	job.JobID = body.JobID
	job.SchemaVersion = models.JobSchemaCurrent
	return &job, nil
}

// fieldWriteFor turns one write into the fields and rows it changes.
//
// job is the write's own document after decoding and after whatever the handler
// did to it, and it must already have been through the entity cipher: a row
// holding an id the cipher rewrites has no stored path for that id, so the row
// is written whole — from this job. Read before the cipher, such a write would
// store the id the client sent and no ref at all.
//
// The schema version is restated whatever the write named, because the writer
// wrote under the model as it stands and a field-scoped write would otherwise
// leave a document claiming the shape it had when it was last written whole.
func fieldWriteFor(body models.JobWriteBody, job *models.Job) (eipmongo.JobFieldWrite, error) {
	fields, err := models.JobSetPaths(body.Document, job)
	if err != nil {
		return eipmongo.JobFieldWrite{}, err
	}
	cleared, err := models.JobUnsetPaths(body.Removed)
	if err != nil {
		return eipmongo.JobFieldWrite{}, err
	}
	fields[models.JobSchemaVersionPath] = models.JobSchemaCurrent

	return eipmongo.JobFieldWrite{
		JobID:    body.JobID,
		Expected: body.Revision,
		Fields:   fields,
		Cleared:  cleared,
	}, nil
}

// readJobWrite is one write and the job it carries, held together so the two
// cannot come apart. Kept as one value rather than two slices because a write
// that fails to decode is dropped, and two slices would then pair every write
// after it with another write's job.
type readJobWrite struct {
	Body models.JobWriteBody
	Job  models.Job
}

// splitJobWrites sorts each write into the way it has to be made, and names the
// ones that cannot be made at all.
//
// A write naming no revision carries its whole document — a create, or a job
// changed with nothing recording what changed — and is checked against whatever
// revision that document's `_meta` holds. Every other write carries the fields
// it changed, checked against the revision the envelope names. The two go to
// different writers, so they are separated before either is asked to write.
//
// Each job must already be as it will be stored — in particular the entity
// cipher must have run, because a row holding an id the cipher rewrites is
// written whole, and it is written from the job as it stands here.
func splitJobWrites(read []readJobWrite) (whole []models.Job, fields []eipmongo.JobFieldWrite, failed []string) {
	for i := range read {
		if read[i].Body.IsWholeDocument() {
			whole = append(whole, read[i].Job)
			continue
		}
		write, err := fieldWriteFor(read[i].Body, &read[i].Job)
		if err != nil {
			failed = append(failed, read[i].Body.JobID)
			continue
		}
		fields = append(fields, write)
	}
	return whole, fields, failed
}

// writtenIDs names the writes in sent that neither failed nor were refused.
//
// What wrote is stated rather than inferred: a response carries one refusal, so
// a caller taking the refusals away from what it sent would count a write that
// never landed.
func writtenIDs[T any](sent []T, idOf func(T) string, failed []string, conflicts []eipmongo.RevisionConflict) []string {
	missed := make(map[string]struct{}, len(failed)+len(conflicts))
	for _, jobID := range failed {
		missed[jobID] = struct{}{}
	}
	for _, conflict := range conflicts {
		missed[conflict.JobID] = struct{}{}
	}

	written := make([]string, 0, len(sent))
	for _, item := range sent {
		jobID := idOf(item)
		if jobID == "" {
			continue
		}
		if _, refused := missed[jobID]; refused {
			continue
		}
		written = append(written, jobID)
	}
	return written
}
