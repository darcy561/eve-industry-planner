package mongo_test

import (
	"context"
	"testing"
	"time"

	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"
	"eve-industry-planner/testing/mongolive"
)

const fieldWriteScratchAccount = "eip-parity-field-write"

func writeFields(t *testing.T, ctx context.Context, mongo *eipmongo.Mongo, owner models.Owner, writes []eipmongo.JobFieldWrite) (int64, []string, []eipmongo.RevisionConflict) {
	t.Helper()
	applied, failed, conflicts, err := mongo.JobDocuments.BulkUpsertJobFields(
		ctx, owner, fieldWriteScratchAccount, writes, time.Now().UTC(), "", "")
	if err != nil {
		t.Fatalf("field write: %v", err)
	}
	return applied, failed, conflicts
}

// A field-scoped write changes what it names and leaves the rest of the document
// alone.
//
// Nothing else asserts this against a real Mongo: the unit tests build the
// update and reason about the paths without a driver, so an update Mongo refuses
// outright — or one whose `$set` reached somewhere other than the path it names
// — would pass every one of them. Stage A's own conditional write was proved
// wrong this way after passing every unit test it had.
//
// Requires EIP_MONGO_PARITY_LIVE=1.
func TestLive_aFieldWriteChangesOnlyWhatItNames(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()

	owner := models.AccountOwner(fieldWriteScratchAccount)
	mongolive.ScratchAccount(t, mongo, fieldWriteScratchAccount)

	const jobID = "job-field-write"
	made := time.Date(2024, 3, 1, 12, 0, 0, 0, time.UTC)
	stored := models.Job{
		JobID:    jobID,
		Name:     "before",
		MetaData: models.JobMetaData{CreatedAt: made},
		Build: models.JobBuild{
			ExtrasCosts: map[string]models.ExtraCost{
				"e-1": {ID: "e-1", ExtraValue: 10},
				"e-2": {ID: "e-2", ExtraValue: 20},
			},
		},
	}
	if _, failed, _, err := mongo.JobDocuments.BulkUpsertJobs(
		ctx, owner, fieldWriteScratchAccount, []models.Job{stored}, time.Now().UTC(), "", ""); err != nil || len(failed) != 0 {
		t.Fatalf("seed: failed=%v err=%v", failed, err)
	}
	seeded := readFieldWriteJob(t, ctx, mongo, owner, jobID)
	if !seeded.MetaData.CreatedAt.Equal(made) {
		t.Fatalf("the seed did not store a creation time to protect, got %v", seeded.MetaData.CreatedAt)
	}

	applied, failed, conflicts := writeFields(t, ctx, mongo, owner, []eipmongo.JobFieldWrite{{
		JobID:    jobID,
		Expected: seeded.MetaData.Revision,
		Fields:   map[string]any{"name": "after"},
		Cleared:  []string{"build.extrasCosts.e-1"},
	}})
	if applied != 1 || len(failed) != 0 || len(conflicts) != 0 {
		t.Fatalf("applied=%d failed=%v conflicts=%v", applied, failed, conflicts)
	}

	after := readFieldWriteJob(t, ctx, mongo, owner, jobID)
	if after.Name != "after" {
		t.Errorf("want the named field changed, got %q", after.Name)
	}
	if _, cleared := after.Build.ExtrasCosts["e-1"]; cleared {
		t.Error("want the named row cleared")
	}
	if row, kept := after.Build.ExtrasCosts["e-2"]; !kept || row.ExtraValue != 20 {
		t.Errorf("want the rest of the collection untouched, got %v", after.Build.ExtrasCosts)
	}
	if after.MetaData.Revision != seeded.MetaData.Revision+1 {
		t.Errorf("want the write counted once, went %d to %d", seeded.MetaData.Revision, after.MetaData.Revision)
	}
	// The write says nothing about when the document was made, so it must not
	// move — a stamp built from a struct would have set it to the zero time.
	if !after.MetaData.CreatedAt.Equal(seeded.MetaData.CreatedAt) {
		t.Errorf("want createdAt left alone, went %v to %v", seeded.MetaData.CreatedAt, after.MetaData.CreatedAt)
	}
}

// A field write built on a revision the document has moved past is refused, and
// the document keeps what it had.
//
// Requires EIP_MONGO_PARITY_LIVE=1.
func TestLive_aStaleFieldWriteIsRefused(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()

	owner := models.AccountOwner(fieldWriteScratchAccount)
	mongolive.ScratchAccount(t, mongo, fieldWriteScratchAccount)

	const jobID = "job-field-write-stale"
	if _, failed, _, err := mongo.JobDocuments.BulkUpsertJobs(
		ctx, owner, fieldWriteScratchAccount, []models.Job{{JobID: jobID, Name: "first"}}, time.Now().UTC(), "", ""); err != nil || len(failed) != 0 {
		t.Fatalf("seed: failed=%v err=%v", failed, err)
	}
	read := readFieldWriteJob(t, ctx, mongo, owner, jobID)

	// One writer lands; the other still holds the revision from before it.
	if applied, _, _ := writeFields(t, ctx, mongo, owner, []eipmongo.JobFieldWrite{{
		JobID: jobID, Expected: read.MetaData.Revision, Fields: map[string]any{"name": "landed"},
	}}); applied != 1 {
		t.Fatalf("want the first write applied, got %d", applied)
	}

	applied, _, conflicts := writeFields(t, ctx, mongo, owner, []eipmongo.JobFieldWrite{{
		JobID: jobID, Expected: read.MetaData.Revision, Fields: map[string]any{"name": "stale"},
	}})
	if applied != 0 || len(conflicts) != 1 || conflicts[0].JobID != jobID {
		t.Fatalf("want the stale write refused, applied=%d conflicts=%v", applied, conflicts)
	}
	if after := readFieldWriteJob(t, ctx, mongo, owner, jobID); after.Name != "landed" {
		t.Errorf("want the landed write kept, got %q", after.Name)
	}
}

func readFieldWriteJob(t *testing.T, ctx context.Context, mongo *eipmongo.Mongo, owner models.Owner, jobID string) models.Job {
	t.Helper()
	job, err := mongo.JobDocuments.LoadJobByID(ctx, owner, jobID)
	if err != nil {
		t.Fatalf("read %s: %v", jobID, err)
	}
	return job
}
