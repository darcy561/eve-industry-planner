package mongo_test

import (
	"context"
	"testing"
	"time"

	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"
	"eve-industry-planner/testing/mongolive"

	"go.mongodb.org/mongo-driver/v2/bson"
)

const conditionalWriteScratchAccount = "eip-parity-conditional-write"

func writeJobs(t *testing.T, ctx context.Context, mongo *eipmongo.Mongo, owner models.Owner, jobs []models.Job) []eipmongo.RevisionConflict {
	t.Helper()
	_, failed, conflicts, err := mongo.JobDocuments.BulkUpsertJobs(
		ctx, owner, conditionalWriteScratchAccount, jobs, time.Now().UTC(), "", "")
	if err != nil {
		t.Fatalf("write: %v", err)
	}
	if len(failed) != 0 {
		t.Fatalf("write: %d jobs rejected before reaching mongo", len(failed))
	}
	return conflicts
}

func TestLive_aStaleConditionalWriteIsRefusedAndTheCurrentOneKept(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()

	owner := models.AccountOwner(conditionalWriteScratchAccount)
	mongolive.ScratchAccount(t, mongo, conditionalWriteScratchAccount)

	const jobID = "job-conditional-write"
	writeJobs(t, ctx, mongo, owner, []models.Job{{JobID: jobID, Name: "first"}})

	readByA := mongolive.ReadJob(t, ctx, mongo.JobDocuments, owner, jobID)
	readByB := mongolive.ReadJob(t, ctx, mongo.JobDocuments, owner, jobID)
	if readByA.MetaData.Revision == 0 {
		t.Fatal("the stored job carries no revision, so no write can be conditional")
	}

	winner := readByA
	winner.Name = "written by A"
	if conflicts := writeJobs(t, ctx, mongo, owner, []models.Job{winner}); len(conflicts) != 0 {
		t.Fatalf("the first write was refused: %+v", conflicts)
	}

	loser := readByB
	loser.Name = "written by B"
	conflicts := writeJobs(t, ctx, mongo, owner, []models.Job{loser})

	if len(conflicts) != 1 {
		t.Fatalf("conflicts = %+v, want B's stale write refused", conflicts)
	}
	if conflicts[0].JobID != jobID {
		t.Fatalf("conflict names %q, want %q", conflicts[0].JobID, jobID)
	}
	if conflicts[0].Expected != readByB.MetaData.Revision {
		t.Fatalf("conflict expected %d, want the revision B read (%d)",
			conflicts[0].Expected, readByB.MetaData.Revision)
	}
	if conflicts[0].Gone {
		t.Fatal("the document still exists, so the conflict must not report it gone")
	}

	stored := mongolive.ReadJob(t, ctx, mongo.JobDocuments, owner, jobID)
	if stored.Name != "written by A" {
		t.Fatalf("stored name = %q, want A's write kept", stored.Name)
	}
	if conflicts[0].Current != stored.MetaData.Revision {
		t.Fatalf("conflict reported current %d, stored is %d",
			conflicts[0].Current, stored.MetaData.Revision)
	}
}

func TestLive_aBatchWithOneStaleJobWritesTheRest(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()

	owner := models.AccountOwner(conditionalWriteScratchAccount)
	mongolive.ScratchAccount(t, mongo, conditionalWriteScratchAccount)

	const staleID, freshID = "job-batch-stale", "job-batch-fresh"
	writeJobs(t, ctx, mongo, owner, []models.Job{
		{JobID: staleID, Name: "stale before"},
		{JobID: freshID, Name: "fresh before"},
	})

	stale := mongolive.ReadJob(t, ctx, mongo.JobDocuments, owner, staleID)
	fresh := mongolive.ReadJob(t, ctx, mongo.JobDocuments, owner, freshID)

	moved := mongolive.ReadJob(t, ctx, mongo.JobDocuments, owner, staleID)
	moved.Name = "moved by somebody else"
	writeJobs(t, ctx, mongo, owner, []models.Job{moved})

	stale.Name = "stale after"
	fresh.Name = "fresh after"
	conflicts := writeJobs(t, ctx, mongo, owner, []models.Job{stale, fresh})

	if len(conflicts) != 1 || conflicts[0].JobID != staleID {
		t.Fatalf("conflicts = %+v, want only the stale job refused", conflicts)
	}
	if got := mongolive.ReadJob(t, ctx, mongo.JobDocuments, owner, freshID); got.Name != "fresh after" {
		t.Fatalf("the unconflicted job was not written: name = %q", got.Name)
	}
	if got := mongolive.ReadJob(t, ctx, mongo.JobDocuments, owner, staleID); got.Name != "moved by somebody else" {
		t.Fatalf("the refused write landed anyway: name = %q", got.Name)
	}
}

func TestLive_aWriteAgainstADeletedDocumentIsReportedGone(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()

	owner := models.AccountOwner(conditionalWriteScratchAccount)
	mongolive.ScratchAccount(t, mongo, conditionalWriteScratchAccount)

	const jobID = "job-deleted-under-writer"
	writeJobs(t, ctx, mongo, owner, []models.Job{{JobID: jobID, Name: "before"}})
	read := mongolive.ReadJob(t, ctx, mongo.JobDocuments, owner, jobID)

	if _, err := mongo.JobDocuments.DeleteManyAfterStampingMeta(ctx,
		bson.M{"_id": eipmongo.OwnerScopedDocumentID(owner, jobID)},
		time.Now().UTC(), "", ""); err != nil {
		t.Fatalf("delete: %v", err)
	}

	read.Name = "after"
	conflicts := writeJobs(t, ctx, mongo, owner, []models.Job{read})

	if len(conflicts) != 1 {
		t.Fatalf("conflicts = %+v, want the deleted document refused", conflicts)
	}
	if !conflicts[0].Gone {
		t.Fatalf("conflict = %+v, want it marked gone", conflicts[0])
	}
	mongolive.RequireJobAbsent(t, ctx, mongo.JobDocuments, owner, jobID)
}
