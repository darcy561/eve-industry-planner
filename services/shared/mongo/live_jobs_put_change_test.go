package mongo_test

import (
	"context"
	"slices"
	"testing"
	"time"

	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"
	"eve-industry-planner/testing/mongolive"

	"go.mongodb.org/mongo-driver/v2/bson"
)

const jobChangeScratchAccount = "eip-parity-job-change"

type jobChange struct {
	applied   int64
	failed    []string
	conflicts []eipmongo.RevisionConflict
}

func jobChangeScratch(t *testing.T, seed ...models.Job) (*eipmongo.Mongo, models.Owner, context.Context) {
	t.Helper()
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	t.Cleanup(cancel)

	owner := models.AccountOwner(jobChangeScratchAccount)
	mongolive.ScratchAccount(t, mongo, jobChangeScratchAccount)
	if len(seed) > 0 {
		mongolive.SeedJobs(t, ctx, mongo, owner, jobChangeScratchAccount, seed...)
	}
	return mongo, owner, ctx
}

func writeJobChange(t *testing.T, ctx context.Context, mongo *eipmongo.Mongo, owner models.Owner, whole []models.Job, fields []eipmongo.JobFieldWrite) jobChange {
	t.Helper()
	return writeJobChangeWithDeletes(t, ctx, mongo, owner, eipmongo.JobChange{Whole: whole, Fields: fields})
}

func writeJobChangeWithDeletes(t *testing.T, ctx context.Context, mongo *eipmongo.Mongo, owner models.Owner, change eipmongo.JobChange) jobChange {
	t.Helper()
	applied, failed, conflicts, err := mongo.WriteJobChange(
		ctx, owner, jobChangeScratchAccount, change, time.Now().UTC(), "", "")
	if err != nil {
		t.Fatalf("write the change: %v", err)
	}
	return jobChange{applied, failed, conflicts}
}

func moveJob(t *testing.T, ctx context.Context, mongo *eipmongo.Mongo, owner models.Owner, jobID string) int64 {
	t.Helper()
	moved := mongolive.ReadJob(t, ctx, mongo.JobDocuments, owner, jobID)
	moved.Name = "moved by somebody else"
	if conflicts := writeJobs(t, ctx, mongo, owner, []models.Job{moved}); len(conflicts) != 0 {
		t.Fatalf("move %s: %+v", jobID, conflicts)
	}
	return mongolive.ReadJob(t, ctx, mongo.JobDocuments, owner, jobID).MetaData.Revision
}

func conflictIDs(conflicts []eipmongo.RevisionConflict) []string {
	ids := make([]string, 0, len(conflicts))
	for _, conflict := range conflicts {
		ids = append(ids, conflict.JobID)
	}
	slices.Sort(ids)
	return ids
}

func TestLive_WriteJobChange_landsAWholeWriteAFieldWriteAndACreateTogether(t *testing.T) {
	mongo, owner, ctx := jobChangeScratch(t,
		models.Job{JobID: "change-whole", Name: "whole before"},
		models.Job{JobID: "change-fields", Name: "fields before"},
	)
	whole := mongolive.ReadJob(t, ctx, mongo.JobDocuments, owner, "change-whole")
	fields := mongolive.ReadJob(t, ctx, mongo.JobDocuments, owner, "change-fields")
	whole.Name = "whole after"

	got := writeJobChange(t, ctx, mongo, owner,
		[]models.Job{whole, {JobID: "change-created", Name: "created"}},
		[]eipmongo.JobFieldWrite{{JobID: "change-fields", Expected: fields.MetaData.Revision, Fields: map[string]any{"name": "fields after"}}},
	)

	if got.applied != 3 || len(got.failed) != 0 || len(got.conflicts) != 0 {
		t.Fatalf("change = %+v, want all three written", got)
	}
	for jobID, want := range map[string]string{
		"change-whole": "whole after", "change-fields": "fields after", "change-created": "created",
	} {
		if stored := mongolive.ReadJob(t, ctx, mongo.JobDocuments, owner, jobID); stored.Name != want {
			t.Errorf("%s stored %q, want %q", jobID, stored.Name, want)
		}
	}
	if after := mongolive.ReadJob(t, ctx, mongo.JobDocuments, owner, "change-whole"); after.MetaData.Revision != whole.MetaData.Revision+1 {
		t.Errorf("whole write moved revision %d to %d, want one step", whole.MetaData.Revision, after.MetaData.Revision)
	}
	if created := mongolive.ReadJob(t, ctx, mongo.JobDocuments, owner, "change-created"); created.MetaData.Revision != 1 {
		t.Errorf("created job holds revision %d, want 1", created.MetaData.Revision)
	}
}

func TestLive_WriteJobChange_writesNothingAndNamesEveryStaleJob(t *testing.T) {
	mongo, owner, ctx := jobChangeScratch(t,
		models.Job{JobID: "change-fresh", Name: "fresh before"},
		models.Job{JobID: "change-stale-whole", Name: "stale before"},
		models.Job{JobID: "change-stale-fields", Name: "stale before"},
	)
	fresh := mongolive.ReadJob(t, ctx, mongo.JobDocuments, owner, "change-fresh")
	staleWhole := mongolive.ReadJob(t, ctx, mongo.JobDocuments, owner, "change-stale-whole")
	staleFields := mongolive.ReadJob(t, ctx, mongo.JobDocuments, owner, "change-stale-fields")
	movedTo := moveJob(t, ctx, mongo, owner, "change-stale-whole")
	moveJob(t, ctx, mongo, owner, "change-stale-fields")

	fresh.Name = "fresh after"
	staleWhole.Name = "stale after"
	got := writeJobChange(t, ctx, mongo, owner,
		[]models.Job{fresh, staleWhole, {JobID: "change-never-created", Name: "created"}},
		[]eipmongo.JobFieldWrite{{JobID: "change-stale-fields", Expected: staleFields.MetaData.Revision, Fields: map[string]any{"name": "stale after"}}},
	)

	if got.applied != 0 || len(got.failed) != 0 {
		t.Fatalf("change = %+v, want nothing written", got)
	}
	if ids := conflictIDs(got.conflicts); !slices.Equal(ids, []string{"change-stale-fields", "change-stale-whole"}) {
		t.Fatalf("conflicts name %v, want both stale jobs and only them", ids)
	}
	for _, conflict := range got.conflicts {
		if conflict.JobID == "change-stale-whole" && (conflict.Expected != staleWhole.MetaData.Revision || conflict.Current != movedTo || conflict.Gone) {
			t.Errorf("conflict %+v, want read at %d and now at %d", conflict, staleWhole.MetaData.Revision, movedTo)
		}
	}
	if stored := mongolive.ReadJob(t, ctx, mongo.JobDocuments, owner, "change-fresh"); stored.Name != "fresh before" || stored.MetaData.Revision != fresh.MetaData.Revision {
		t.Errorf("the fresh job was written: %q at %d", stored.Name, stored.MetaData.Revision)
	}
	for _, jobID := range []string{"change-stale-whole", "change-stale-fields"} {
		if stored := mongolive.ReadJob(t, ctx, mongo.JobDocuments, owner, jobID); stored.Name != "moved by somebody else" {
			t.Errorf("%s stored %q, want the intervening write kept", jobID, stored.Name)
		}
	}
	mongolive.RequireJobAbsent(t, ctx, mongo.JobDocuments, owner, "change-never-created")
}

func TestLive_WriteJobChange_aCreateWhoseJobAlreadyExistsRefusesTheChange(t *testing.T) {
	mongo, owner, ctx := jobChangeScratch(t,
		models.Job{JobID: "change-taken", Name: "already here"},
		models.Job{JobID: "change-beside", Name: "beside before"},
	)
	taken := mongolive.ReadJob(t, ctx, mongo.JobDocuments, owner, "change-taken")
	beside := mongolive.ReadJob(t, ctx, mongo.JobDocuments, owner, "change-beside")
	beside.Name = "beside after"

	got := writeJobChange(t, ctx, mongo, owner,
		[]models.Job{beside, {JobID: "change-taken", Name: "created over it"}}, nil)

	if got.applied != 0 || len(got.conflicts) != 1 {
		t.Fatalf("change = %+v, want it refused on the existing job", got)
	}
	if conflict := got.conflicts[0]; conflict.JobID != "change-taken" || conflict.Expected != 0 || conflict.Current != taken.MetaData.Revision || conflict.Gone {
		t.Errorf("conflict %+v, want the existing job named at revision %d", conflict, taken.MetaData.Revision)
	}
	if stored := mongolive.ReadJob(t, ctx, mongo.JobDocuments, owner, "change-taken"); stored.Name != "already here" {
		t.Errorf("the existing job was overwritten: %q", stored.Name)
	}
	if stored := mongolive.ReadJob(t, ctx, mongo.JobDocuments, owner, "change-beside"); stored.Name != "beside before" {
		t.Errorf("the job beside it was written: %q", stored.Name)
	}
}

func TestLive_WriteJobChange_aJobDeletedUnderTheChangeIsReportedGone(t *testing.T) {
	mongo, owner, ctx := jobChangeScratch(t, models.Job{JobID: "change-deleted", Name: "before"})
	read := mongolive.ReadJob(t, ctx, mongo.JobDocuments, owner, "change-deleted")
	if _, err := mongo.JobDocuments.DeleteManyAfterStampingMeta(ctx,
		bson.M{"_id": eipmongo.OwnerScopedDocumentID(owner, "change-deleted")},
		time.Now().UTC(), "", ""); err != nil {
		t.Fatalf("delete: %v", err)
	}

	got := writeJobChange(t, ctx, mongo, owner, nil,
		[]eipmongo.JobFieldWrite{{JobID: "change-deleted", Expected: read.MetaData.Revision, Fields: map[string]any{"name": "after"}}})

	if len(got.conflicts) != 1 || !got.conflicts[0].Gone || got.conflicts[0].Expected != read.MetaData.Revision {
		t.Fatalf("conflicts = %+v, want the deleted job reported gone", got.conflicts)
	}
	mongolive.RequireJobAbsent(t, ctx, mongo.JobDocuments, owner, "change-deleted")
}

func TestLive_WriteJobChange_aWriteThatCannotBeMadeWritesNothing(t *testing.T) {
	mongo, owner, ctx := jobChangeScratch(t, models.Job{JobID: "change-planned", Name: "before"})
	planned := mongolive.ReadJob(t, ctx, mongo.JobDocuments, owner, "change-planned")
	planned.Name = "after"

	got := writeJobChange(t, ctx, mongo, owner, []models.Job{planned},
		[]eipmongo.JobFieldWrite{{JobID: "change-unplannable", Fields: map[string]any{"name": "after"}}})

	if got.applied != 0 || !slices.Equal(got.failed, []string{"change-unplannable"}) {
		t.Fatalf("change = %+v, want the unplannable write named and nothing written", got)
	}
	if stored := mongolive.ReadJob(t, ctx, mongo.JobDocuments, owner, "change-planned"); stored.Name != "before" {
		t.Errorf("the plannable job was written: %q", stored.Name)
	}
}

func TestLive_WriteJobChange_removesJobsAlongsideItsWrites(t *testing.T) {
	mongo, owner, ctx := jobChangeScratch(t,
		models.Job{JobID: "change-replacement", Name: "before"},
		models.Job{JobID: "change-replaced", Name: "replaced"},
	)
	replacement := mongolive.ReadJob(t, ctx, mongo.JobDocuments, owner, "change-replacement")
	replaced := mongolive.ReadJob(t, ctx, mongo.JobDocuments, owner, "change-replaced")
	replacement.Name = "after"

	got := writeJobChangeWithDeletes(t, ctx, mongo, owner, eipmongo.JobChange{
		Whole:   []models.Job{replacement},
		Deletes: []models.JobDeleteBody{{JobID: "change-replaced", Revision: replaced.MetaData.Revision}},
	})

	if got.applied != 2 || len(got.failed) != 0 || len(got.conflicts) != 0 {
		t.Fatalf("change = %+v, want the write and the removal made", got)
	}
	if stored := mongolive.ReadJob(t, ctx, mongo.JobDocuments, owner, "change-replacement"); stored.Name != "after" {
		t.Errorf("replacement stored %q, want after", stored.Name)
	}
	mongolive.RequireJobAbsent(t, ctx, mongo.JobDocuments, owner, "change-replaced")
}

func TestLive_WriteJobChange_aRemovalOfAMovedJobTouchesNothing(t *testing.T) {
	mongo, owner, ctx := jobChangeScratch(t,
		models.Job{JobID: "change-kept", Name: "before"},
		models.Job{JobID: "change-moved", Name: "before"},
	)
	kept := mongolive.ReadJob(t, ctx, mongo.JobDocuments, owner, "change-kept")
	moved := mongolive.ReadJob(t, ctx, mongo.JobDocuments, owner, "change-moved")
	movedTo := moveJob(t, ctx, mongo, owner, "change-moved")
	kept.Name = "after"

	got := writeJobChangeWithDeletes(t, ctx, mongo, owner, eipmongo.JobChange{
		Whole:   []models.Job{kept},
		Deletes: []models.JobDeleteBody{{JobID: "change-moved", Revision: moved.MetaData.Revision}},
	})

	if got.applied != 0 || len(got.conflicts) != 1 {
		t.Fatalf("change = %+v, want it refused on the moved job", got)
	}
	if conflict := got.conflicts[0]; conflict.JobID != "change-moved" || conflict.Current != movedTo || conflict.Gone {
		t.Errorf("conflict %+v, want the moved job named at revision %d", conflict, movedTo)
	}
	if stored := mongolive.ReadJob(t, ctx, mongo.JobDocuments, owner, "change-moved"); stored.Name != "moved by somebody else" {
		t.Errorf("the moved job was removed or rewritten: %q", stored.Name)
	}
	if stored := mongolive.ReadJob(t, ctx, mongo.JobDocuments, owner, "change-kept"); stored.Name != "before" {
		t.Errorf("the write beside the refused removal landed: %q", stored.Name)
	}
}

func TestLive_WriteJobChange_aRemovalOfAJobAlreadyGoneIsReportedGone(t *testing.T) {
	mongo, owner, ctx := jobChangeScratch(t, models.Job{JobID: "change-already-gone", Name: "before"})
	read := mongolive.ReadJob(t, ctx, mongo.JobDocuments, owner, "change-already-gone")
	if _, err := mongo.JobDocuments.DeleteManyAfterStampingMeta(ctx,
		bson.M{"_id": eipmongo.OwnerScopedDocumentID(owner, "change-already-gone")},
		time.Now().UTC(), "", ""); err != nil {
		t.Fatalf("delete: %v", err)
	}

	got := writeJobChangeWithDeletes(t, ctx, mongo, owner, eipmongo.JobChange{
		Deletes: []models.JobDeleteBody{{JobID: "change-already-gone", Revision: read.MetaData.Revision}},
	})

	if len(got.conflicts) != 1 || !got.conflicts[0].Gone {
		t.Fatalf("conflicts = %+v, want the job reported gone", got.conflicts)
	}
}
