package mongo

import (
	"strings"
	"testing"
	"time"

	"eve-industry-planner/shared/models"

	"go.mongodb.org/mongo-driver/v2/bson"
)

func writeMeta() bson.M {
	return JobWriteStamp(
		models.AccountOwner("account-1"),
		"account-1",
		time.Unix(0, 0).UTC(),
		"",
		"",
	)
}

func TestSetFieldsWithRevisionCarriesTheFieldsAndCountsTheWrite(t *testing.T) {
	update, err := SetFieldsWithRevision(
		map[string]any{"build.materials.34.quantity": 100},
		nil,
		writeMeta(),
	)
	if err != nil {
		t.Fatalf("SetFieldsWithRevision: %v", err)
	}

	set := update["$set"].(bson.M)
	if set["build.materials.34.quantity"] != 100 {
		t.Errorf("want the field written, got %v", set)
	}
	if update["$inc"].(bson.M)[FieldMetaRevision] != 1 {
		t.Errorf("want the write counted once, got %v", update["$inc"])
	}
	if _, cleared := update["$unset"]; cleared {
		t.Errorf("want nothing cleared, got %v", update["$unset"])
	}
}

func TestSetFieldsWithRevisionLeavesTheCounterToTheIncrement(t *testing.T) {
	update, err := SetFieldsWithRevision(map[string]any{"name": "A job"}, nil, writeMeta())
	if err != nil {
		t.Fatalf("SetFieldsWithRevision: %v", err)
	}

	set := update["$set"].(bson.M)
	if _, named := set[FieldMetaRevision]; named {
		t.Errorf("the revision must not be set, got %v", set[FieldMetaRevision])
	}
	if set["_meta.lastUpdatedBy"] != "account-1" {
		t.Errorf("want the rest of _meta set by path, got %v", set)
	}
}

func TestSetFieldsWithRevisionClearsTheRowsItWasGiven(t *testing.T) {
	update, err := SetFieldsWithRevision(
		map[string]any{"name": "A job"},
		[]string{"esi.industryJobs.500001"},
		writeMeta(),
	)
	if err != nil {
		t.Fatalf("SetFieldsWithRevision: %v", err)
	}

	unset := update["$unset"].(bson.M)
	if _, cleared := unset["esi.industryJobs.500001"]; !cleared {
		t.Errorf("want the row cleared, got %v", unset)
	}
}

func TestSetFieldsWithRevisionRefusesPathsThatReachEachOther(t *testing.T) {
	for _, overlap := range []struct {
		fields  map[string]any
		cleared []string
	}{
		{map[string]any{"esi.industryJobs": bson.M{}}, []string{"esi.industryJobs.500001"}},
		{map[string]any{"esi.industryJobs.500001.job_id": 1}, []string{"esi.industryJobs.500001"}},
		{map[string]any{"esi.industryJobs.500001": bson.M{}}, []string{"esi.industryJobs.500001"}},
	} {
		if _, err := SetFieldsWithRevision(overlap.fields, overlap.cleared, writeMeta()); err == nil {
			t.Errorf("want %v and %v refused", overlap.fields, overlap.cleared)
		}
	}
}

func TestSetFieldsWithRevisionAllowsSiblingsOfOneCollection(t *testing.T) {
	_, err := SetFieldsWithRevision(
		map[string]any{"esi.industryJobs.500002": bson.M{}},
		[]string{"esi.industryJobs.500001"},
		writeMeta(),
	)
	if err != nil {
		t.Fatalf("want siblings allowed, got %v", err)
	}
}

func TestSetFieldsWithRevisionAllowsAKeyThatStartsAnother(t *testing.T) {
	_, err := SetFieldsWithRevision(
		map[string]any{"build.materials.345.quantity": 10},
		[]string{"build.materials.34"},
		writeMeta(),
	)
	if err != nil {
		t.Fatalf("want distinct rows allowed, got %v", err)
	}
}

func TestSetFieldsWithRevisionRefusesTwoClearedPathsThatReachEachOther(t *testing.T) {
	_, err := SetFieldsWithRevision(nil, []string{
		"build.materials.34.purchasing.p-1",
		"build.materials.34",
	}, writeMeta())
	if err == nil {
		t.Fatal("want a row and a row inside it refused")
	}
}

func TestSetFieldsWithRevisionRefusesTwoFieldsThatReachEachOther(t *testing.T) {
	_, err := SetFieldsWithRevision(map[string]any{
		"build.materials":             bson.M{},
		"build.materials.34.quantity": 10,
	}, nil, writeMeta())
	if err == nil {
		t.Fatal("want a collection and a field inside it refused")
	}
}

func TestSetFieldsWithRevisionRefusesAPathIntoMeta(t *testing.T) {
	if _, err := SetFieldsWithRevision(map[string]any{"_meta.revision": 99}, nil, writeMeta()); err == nil {
		t.Error("want a write into _meta refused")
	}
	if _, err := SetFieldsWithRevision(nil, []string{"_meta.lastUpdatedBy"}, writeMeta()); err == nil {
		t.Error("want a clear of _meta refused")
	}
}

func TestSetFieldsWithRevisionClearsWithoutCarryingAnyField(t *testing.T) {
	update, err := SetFieldsWithRevision(nil, []string{"build.extrasCosts.e-1"}, writeMeta())
	if err != nil {
		t.Fatalf("SetFieldsWithRevision: %v", err)
	}

	if update["$set"].(bson.M)["_meta.lastUpdatedBy"] != "account-1" {
		t.Errorf("want the write still stamped, got %v", update["$set"])
	}
	if _, cleared := update["$unset"].(bson.M)["build.extrasCosts.e-1"]; !cleared {
		t.Errorf("want the row cleared, got %v", update["$unset"])
	}
}

func TestSetFieldsWithRevisionCarriesAWholeCollection(t *testing.T) {
	rows := bson.M{"500002": bson.M{"job_id": 500002}}
	update, err := SetFieldsWithRevision(
		map[string]any{"esi.industryJobs": rows},
		nil,
		writeMeta(),
	)
	if err != nil {
		t.Fatalf("SetFieldsWithRevision: %v", err)
	}

	got, ok := update["$set"].(bson.M)["esi.industryJobs"].(bson.M)
	if !ok || len(got) != 1 {
		t.Fatalf("want the collection carried whole, got %v", update["$set"])
	}
}

func TestSetFieldsWithRevisionRefusesAcrossASiblingThatSortsBetween(t *testing.T) {
	_, err := SetFieldsWithRevision(map[string]any{
		"build.materials.34":          bson.M{},
		"build.materials.34-old":      bson.M{},
		"build.materials.34.quantity": 10,
	}, nil, writeMeta())
	if err == nil {
		t.Fatal("want the row and the field inside it refused")
	}
}

func TestSetFieldsWithRevisionNamesBothPathsWhenItRefuses(t *testing.T) {
	_, err := SetFieldsWithRevision(
		map[string]any{"esi.industryJobs": bson.M{}},
		[]string{"esi.industryJobs.500001"},
		writeMeta(),
	)
	if err == nil || !strings.Contains(err.Error(), "esi.industryJobs.500001") {
		t.Fatalf("want the refusal to name the paths, got %v", err)
	}
}

func fieldWrites() []JobFieldWrite {
	return []JobFieldWrite{
		{JobID: "job-1", Expected: 4, Fields: map[string]any{"name": "A job"}},
		{JobID: "job-2", Expected: 9, Cleared: []string{"build.extrasCosts.e-1"}},
	}
}

func planned(t *testing.T, writes []JobFieldWrite) ([]conditionalJobWrite, []string) {
	t.Helper()
	return planJobFieldWrites(
		models.AccountOwner("account-1"),
		"account-1",
		writes,
		time.Unix(0, 0).UTC(),
		"sess-1",
		"client-1",
	)
}

func TestPlanJobFieldWritesMakesOneConditionalWritePerJob(t *testing.T) {
	writes, failed := planned(t, fieldWrites())

	if len(failed) != 0 {
		t.Fatalf("want none failed, got %v", failed)
	}
	if len(writes) != 2 {
		t.Fatalf("want a write each, got %d", len(writes))
	}
	if writes[0].expected != 4 || writes[1].expected != 9 {
		t.Errorf("want each checked against the revision it read, got %v", writes)
	}
}

func TestPlanJobFieldWritesRefusesAWriteWithNoRevision(t *testing.T) {
	writes, failed := planned(t, []JobFieldWrite{
		{JobID: "job-new", Fields: map[string]any{"name": "A job"}},
	})

	if len(writes) != 0 {
		t.Errorf("want nothing written, got %v", writes)
	}
	if len(failed) != 1 || failed[0] != "job-new" {
		t.Errorf("want the job named as unwritten, got %v", failed)
	}
}

func TestPlanJobFieldWritesDropsOnlyTheJobItCannotWrite(t *testing.T) {
	writes, failed := planned(t, []JobFieldWrite{
		{JobID: "job-1", Expected: 4, Fields: map[string]any{"name": "A job"}},
		{
			JobID:    "job-bad",
			Expected: 4,
			Fields:   map[string]any{"esi.industryJobs": bson.M{}},
			Cleared:  []string{"esi.industryJobs.500001"},
		},
	})

	if len(writes) != 1 || writes[0].jobID != "job-1" {
		t.Errorf("want the sound job still written, got %v", writes)
	}
	if len(failed) != 1 || failed[0] != "job-bad" {
		t.Errorf("want only the unsound job named, got %v", failed)
	}
}

func TestPlanJobFieldWritesStampsWhoWroteAndWhen(t *testing.T) {
	writes, _ := planned(t, fieldWrites()[:1])

	set := writes[0].update["$set"].(bson.M)
	if set["_meta.lastUpdatedBy"] != "account-1" {
		t.Errorf("want the writer stamped, got %v", set)
	}
	if set["_meta.sessionID"] != "sess-1" {
		t.Errorf("want the session stamped, got %v", set)
	}
}

func TestJobWriteStampSaysOnlyWhatTheWriteDid(t *testing.T) {
	stamp := JobWriteStamp(
		models.AccountOwner("account-1"),
		"account-1",
		time.Unix(0, 0).UTC(),
		"sess-1",
		"client-1",
	)

	for _, named := range []string{
		"_meta.lastModified",
		"_meta.lastUpdatedBy",
		"_meta.owner",
		"_meta.sessionID",
		"_meta.clientID",
	} {
		if _, ok := stamp[named]; !ok {
			t.Errorf("want %s stamped, got %v", named, stamp)
		}
	}
	for _, untouched := range []string{
		"_meta.createdAt",
		"_meta.revision",
		"_meta.archivedAt",
		"_meta.archivedBy",
		"_meta.archiveProcessed",
		"_meta.deletedAt",
		"_meta.deletedBy",
	} {
		if _, ok := stamp[untouched]; ok {
			t.Errorf("%s is not this write's to state, got %v", untouched, stamp[untouched])
		}
	}
}

func TestJobWriteStampWithoutASession(t *testing.T) {
	stamp := JobWriteStamp(models.AccountOwner("account-1"), "account-1", time.Unix(0, 0).UTC(), "", "")

	if _, ok := stamp["_meta.sessionID"]; ok {
		t.Errorf("want no session named, got %v", stamp["_meta.sessionID"])
	}
	if stamp["_meta.lastUpdatedBy"] != "account-1" {
		t.Errorf("want the writer named, got %v", stamp)
	}
}
