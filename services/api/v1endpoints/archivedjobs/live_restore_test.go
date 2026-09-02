package archivedjobs

import (
	"context"
	"slices"
	"testing"
	"time"

	"eve-industry-planner/api/apideps"
	"eve-industry-planner/shared/crypto/entityid"
	"eve-industry-planner/shared/jobidentity"
	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"
	"eve-industry-planner/testing/mongolive"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// The restore sequence is seven writes in a fixed order across five collections,
// and the pieces either side of it are unit tested while the sequence itself is
// not. These drive it against stack Mongo. Requires EIP_MONGO_PARITY_LIVE=1.

const restoreScratchAccount = "eip-parity-restore-account"

// A key of this test's own: the sequence encrypts and decrypts entity ids, and
// what matters is that the round trip holds, not which key made it.
func restoreHandlers(t *testing.T, mongo *eipmongo.Mongo) *Handlers {
	t.Helper()
	cipher, err := entityid.New([]byte("live-restore-test-entity-id-key-0123456789"))
	if err != nil {
		t.Fatalf("entity cipher: %v", err)
	}
	return &Handlers{Deps: &apideps.Deps{Mongo: mongo, EntityCipher: cipher}}
}

// archiveJob writes a job into the archive the way the PUT route leaves it:
// entity ids as refs, and the lifecycle stamps that say it is archived.
func archiveJob(t *testing.T, ctx context.Context, h *Handlers, job models.Job, at time.Time) {
	t.Helper()
	job.MetaData.AccountID = restoreScratchAccount
	job.MetaData.ArchivedAt = at
	job.MetaData.ArchivedBy = restoreScratchAccount
	if err := jobidentity.Encrypt(&job, h.EntityCipher); err != nil {
		t.Fatalf("encrypt %s: %v", job.JobID, err)
	}
	if _, err := h.Mongo.ArchivedJobs.UpsertStructPreservingMeta(ctx, job, job.JobID); err != nil {
		t.Fatalf("seed archived job %s: %v", job.JobID, err)
	}
}

// contributedRow is the statistics row an archived job leaves behind, stamped as
// counted, which is the state a restore has to take back out.
func contributedRow(t *testing.T, ctx context.Context, mongo *eipmongo.Mongo, jobID string, at time.Time) {
	t.Helper()
	row := models.ArchivedJobStats{
		ID:            eipmongo.ArchivedJobStatsDocumentID(restoreScratchAccount, jobID),
		AccountID:     restoreScratchAccount,
		JobID:         jobID,
		TypeID:        34,
		CostMonth:     models.CalendarMonth{Year: at.Year(), Month: int(at.Month())},
		ContributedAt: &at,
	}
	if _, err := mongo.ArchivedJobStats.UpsertStructPreservingMeta(ctx, row, row.ID); err != nil {
		t.Fatalf("seed stats row for %s: %v", jobID, err)
	}
}

func seedJob(jobID string) models.Job {
	job := models.Job{JobID: jobID, ItemID: 34, JobType: 1, Name: "Tritanium"}
	job.MetaData.AccountID = restoreScratchAccount
	return job
}

// The whole point of the sequence: the job is on the planner, out of the
// archive, no longer counted, and the work to uncount it is queued.
func TestLive_restorePutsTheJobBackAndTakesItOutOfTheArchive(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	mongolive.ScratchAccount(t, mongo, restoreScratchAccount)

	h := restoreHandlers(t, mongo)
	now := time.Now().UTC()
	archiveJob(t, ctx, h, seedJob("job-restore-1"), now)
	contributedRow(t, ctx, mongo, "job-restore-1", now)

	scope, err := accountArchiveScope(mongo, restoreScratchAccount)
	if err != nil {
		t.Fatalf("archive scope: %v", err)
	}
	jobs, _, err := selectJobsToRestore(ctx, scope, restoreScopeJob, "job-restore-1")
	if err != nil || len(jobs) != 1 {
		t.Fatalf("select: %v, jobs %d", err, len(jobs))
	}

	result, err := restoreJobs(ctx, h, restoreRequest{Archive: scope, Jobs: jobs, SessionID: "sess-1"})
	if err != nil {
		t.Fatalf("restoreJobs: %v", err)
	}
	if len(result.RestoredJobIDs) != 1 {
		t.Fatalf("restored %d jobs, want 1", len(result.RestoredJobIDs))
	}

	restored, err := mongo.JobDocuments.LoadJobByID(ctx, restoreScratchAccount, "job-restore-1")
	if err != nil {
		t.Fatalf("the job is not on the planner: %v", err)
	}
	// The stamps are what mark a job as archived, so a restore that left them
	// would put back a job the archive views still claim.
	if !restored.MetaData.ArchivedAt.IsZero() || restored.MetaData.ArchivedBy != "" {
		t.Fatalf("restored job still carries its archive stamps: %+v", restored.MetaData)
	}

	held, err := mongo.ArchivedJobs.Collection().CountDocuments(ctx, bson.M{"_id": "job-restore-1"})
	if err != nil || held != 0 {
		t.Fatalf("archived document survived the restore: count %d, err %v", held, err)
	}

	var row models.ArchivedJobStats
	if err := mongo.ArchivedJobStats.Collection().FindOne(ctx,
		bson.M{"_id": eipmongo.ArchivedJobStatsDocumentID(restoreScratchAccount, "job-restore-1")},
	).Decode(&row); err != nil {
		t.Fatalf("statistics row: %v", err)
	}
	// Revoked but still stamped: the stamp says the figures are in the
	// aggregates, and the revocation is what asks for them to come back out.
	if !row.Revoked || row.ContributedAt == nil {
		t.Fatalf("row is revoked=%v contributedAt=%v, want revoked with its stamp", row.Revoked, row.ContributedAt)
	}

	var entry struct {
		Work string `bson:"work"`
	}
	if err := mongo.AccountRebuildQueue.Collection().FindOne(ctx,
		bson.M{"_id": models.AccountStatsOwner(restoreScratchAccount).Key()},
	).Decode(&entry); err != nil {
		t.Fatalf("no statistics work queued: %v", err)
	}
	if entry.Work != string(eipmongo.StatsWorkDelta) {
		t.Fatalf("queued %q, want a delta: taking one job back out is not a rebuild", entry.Work)
	}
}

// A job archived out of a group rejoins it, and the group stops naming it as
// archived — otherwise the derived sets keep leaving it out.
func TestLive_restoreReturnsTheJobToItsGroup(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	mongolive.ScratchAccount(t, mongo, restoreScratchAccount)

	h := restoreHandlers(t, mongo)
	now := time.Now().UTC()

	job := seedJob("job-restore-grouped")
	job.GroupID = "group-restore-1"
	job.IncludedInGroup = true
	archiveJob(t, ctx, h, job, now)

	group := models.Group{
		AccountID:      restoreScratchAccount,
		GroupID:        "group-restore-1",
		GroupName:      "Restore group",
		IncludedJobIDs: []string{"job-restore-grouped"},
		ArchivedJobIDs: []string{"job-restore-grouped"},
	}
	group.MetaData.AccountID = restoreScratchAccount
	if _, err := mongo.Groups.UpsertStructPreservingMeta(ctx, group, group.GroupID); err != nil {
		t.Fatalf("seed group: %v", err)
	}

	scope, err := accountArchiveScope(mongo, restoreScratchAccount)
	if err != nil {
		t.Fatalf("archive scope: %v", err)
	}
	jobs, _, err := selectJobsToRestore(ctx, scope, restoreScopeGroup, "group-restore-1")
	if err != nil || len(jobs) != 1 {
		t.Fatalf("select by group: %v, jobs %d", err, len(jobs))
	}
	if _, err := restoreJobs(ctx, h, restoreRequest{Archive: scope, Jobs: jobs, SessionID: "sess-2"}); err != nil {
		t.Fatalf("restoreJobs: %v", err)
	}

	stored, err := mongo.Groups.LoadGroupByID(ctx, restoreScratchAccount, "group-restore-1")
	if err != nil {
		t.Fatalf("load group: %v", err)
	}
	if !slices.Contains(stored.IncludedJobIDs, "job-restore-grouped") {
		t.Fatalf("group no longer holds the job: %v", stored.IncludedJobIDs)
	}
	if slices.Contains(stored.ArchivedJobIDs, "job-restore-grouped") {
		t.Fatalf("group still lists the job as archived: %v", stored.ArchivedJobIDs)
	}
}

// An ESI id claimed by a job still on the planner cannot be handed back. The
// restore reports it and drops the link rather than refusing the job.
func TestLive_restoreStripsAnEsiIdAnotherJobAlreadyHolds(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	mongolive.ScratchAccount(t, mongo, restoreScratchAccount)

	h := restoreHandlers(t, mongo)
	now := time.Now().UTC()

	const contested, free = 4242, 4243
	holder := seedJob("job-restore-holder")
	holder.APIJobs = []int{contested}
	if _, failed, err := mongo.JobDocuments.BulkUpsertJobs(ctx, restoreScratchAccount, []models.Job{holder}, now, "sess-3", ""); err != nil || failed > 0 {
		t.Fatalf("seed holder job: %v, failed %d", err, failed)
	}

	archived := seedJob("job-restore-contested")
	archived.APIJobs = []int{contested, free}
	archiveJob(t, ctx, h, archived, now)

	scope, err := accountArchiveScope(mongo, restoreScratchAccount)
	if err != nil {
		t.Fatalf("archive scope: %v", err)
	}
	jobs, _, err := selectJobsToRestore(ctx, scope, restoreScopeJob, "job-restore-contested")
	if err != nil || len(jobs) != 1 {
		t.Fatalf("select: %v, jobs %d", err, len(jobs))
	}

	result, err := restoreJobs(ctx, h, restoreRequest{Archive: scope, Jobs: jobs, SessionID: "sess-3"})
	if err != nil {
		t.Fatalf("restoreJobs: %v", err)
	}
	if len(result.Conflicts) != 1 || result.Conflicts[0].ID != contested {
		t.Fatalf("conflicts %+v, want the one id another job holds", result.Conflicts)
	}
	if len(result.RestoredJobIDs) != 1 {
		t.Fatal("a contested link should not stop the job coming back")
	}

	restored, err := mongo.JobDocuments.LoadJobByID(ctx, restoreScratchAccount, "job-restore-contested")
	if err != nil {
		t.Fatalf("load restored job: %v", err)
	}
	if slices.Contains(restored.APIJobs, contested) {
		t.Fatalf("restored job kept an id another job holds: %v", restored.APIJobs)
	}
	if !slices.Contains(restored.APIJobs, free) {
		t.Fatalf("restored job lost an uncontested id: %v", restored.APIJobs)
	}
}
