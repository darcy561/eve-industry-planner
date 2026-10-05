package mongo_test

import (
	"testing"
	"time"

	"eve-industry-planner/shared/models"
	"eve-industry-planner/testing/mongolive"
)

func TestLive_ArchiveJobs_movesTheJobOffThePlannerIntoTheArchive(t *testing.T) {
	mongo, owner, ctx := jobChangeScratch(t, models.Job{JobID: "archive-moved", Name: "built"})
	read := mongolive.ReadJob(t, ctx, mongo.JobDocuments, owner, "archive-moved")

	failed, conflicts, err := mongo.ArchiveJobs(ctx, owner, []models.Job{read}, time.Now().UTC(), "", "")

	if err != nil || len(failed) != 0 || len(conflicts) != 0 {
		t.Fatalf("archive = failed %v conflicts %+v err %v, want it moved", failed, conflicts, err)
	}
	mongolive.RequireJobAbsent(t, ctx, mongo.JobDocuments, owner, "archive-moved")
	mongolive.ReadJob(t, ctx, mongo.ArchivedJobs, owner, "archive-moved")
}

func TestLive_ArchiveJobs_aJobEditedSinceItWasReadArchivesNothing(t *testing.T) {
	mongo, owner, ctx := jobChangeScratch(t,
		models.Job{JobID: "archive-fresh", Name: "built"},
		models.Job{JobID: "archive-edited", Name: "built"},
	)
	fresh := mongolive.ReadJob(t, ctx, mongo.JobDocuments, owner, "archive-fresh")
	edited := mongolive.ReadJob(t, ctx, mongo.JobDocuments, owner, "archive-edited")
	movedTo := moveJob(t, ctx, mongo, owner, "archive-edited")

	_, conflicts, err := mongo.ArchiveJobs(ctx, owner, []models.Job{fresh, edited}, time.Now().UTC(), "", "")

	if err != nil || len(conflicts) != 1 || conflicts[0].JobID != "archive-edited" || conflicts[0].Current != movedTo {
		t.Fatalf("conflicts = %+v err %v, want the edited job named at %d", conflicts, err, movedTo)
	}
	for _, jobID := range []string{"archive-fresh", "archive-edited"} {
		mongolive.RequireJobAbsent(t, ctx, mongo.ArchivedJobs, owner, jobID)
		mongolive.ReadJob(t, ctx, mongo.JobDocuments, owner, jobID)
	}
}

func TestLive_ArchiveJobs_aJobWithoutARevisionIsNamedAndNothingMoves(t *testing.T) {
	mongo, owner, ctx := jobChangeScratch(t, models.Job{JobID: "archive-unread", Name: "built"})
	read := mongolive.ReadJob(t, ctx, mongo.JobDocuments, owner, "archive-unread")
	read.MetaData.Revision = 0

	failed, _, err := mongo.ArchiveJobs(ctx, owner, []models.Job{read}, time.Now().UTC(), "", "")

	if err != nil || len(failed) != 1 || failed[0] != "archive-unread" {
		t.Fatalf("failed = %v err %v, want the job named", failed, err)
	}
	mongolive.RequireJobAbsent(t, ctx, mongo.ArchivedJobs, owner, "archive-unread")
}
