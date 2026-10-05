package archivedjobs

import (
	"context"
	"slices"
	"strconv"
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

const restoreScratchAccount = "eip-parity-restore-account"

func restoreHandlers(t *testing.T, mongo *eipmongo.Mongo) *Handlers {
	t.Helper()
	cipher, err := entityid.New([]byte("live-restore-test-entity-id-key-0123456789"))
	if err != nil {
		t.Fatalf("entity cipher: %v", err)
	}
	return &Handlers{Deps: &apideps.Deps{Mongo: mongo, EntityCipher: cipher}}
}

func archiveJob(t *testing.T, ctx context.Context, h *Handlers, job models.Job, at time.Time) {
	t.Helper()
	archiveJobFor(t, ctx, h, job, restoreScratchAccount, at)
}

func archiveJobFor(t *testing.T, ctx context.Context, h *Handlers, job models.Job, accountID string, at time.Time) {
	t.Helper()
	job.MetaData.Owner = models.AccountOwner(accountID)
	job.MetaData.ArchivedAt = at
	job.MetaData.ArchivedBy = accountID
	if err := jobidentity.Encrypt(&job, h.EntityCipher); err != nil {
		t.Fatalf("encrypt %s: %v", job.JobID, err)
	}
	if _, err := h.Mongo.ArchivedJobs.UpsertStructPreservingMeta(ctx, job,
		eipmongo.OwnerScopedDocumentID(models.AccountOwner(accountID), job.JobID)); err != nil {
		t.Fatalf("seed archived job %s: %v", job.JobID, err)
	}
}

func contributedRow(t *testing.T, ctx context.Context, mongo *eipmongo.Mongo, jobID string, at time.Time) {
	t.Helper()
	row := models.ArchivedJobStats{
		ID:            eipmongo.ArchivedJobStatsDocumentID(models.AccountOwner(restoreScratchAccount), jobID),
		Owner:         models.AccountOwner(restoreScratchAccount),
		JobID:         jobID,
		TypeID:        34,
		CostMonth:     models.CalendarMonth{Year: at.Year(), Month: int(at.Month())},
		ContributedAt: &at,
	}
	if _, err := mongo.StatisticsRows.UpsertStructPreservingMeta(ctx, row, row.ID); err != nil {
		t.Fatalf("seed stats row for %s: %v", jobID, err)
	}
}

func seedJob(jobID string) models.Job {
	job := models.Job{JobID: jobID, ItemID: 34, JobType: 1, Name: "Tritanium"}
	job.MetaData.Owner = models.AccountOwner(restoreScratchAccount)
	return job
}

func TestLive_restorePutsTheJobBackAndTakesItOutOfTheArchive(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	mongolive.ScratchAccount(t, mongo, restoreScratchAccount)

	h := restoreHandlers(t, mongo)
	now := time.Now().UTC()
	archiveJob(t, ctx, h, seedJob("job-restore-1"), now)
	contributedRow(t, ctx, mongo, "job-restore-1", now)

	scope, err := plannerArchiveScope(mongo, models.AccountOwner(restoreScratchAccount))
	if err != nil {
		t.Fatalf("archive scope: %v", err)
	}
	jobs, _, err := selectArchivedJobs(ctx, scope, selectionJob, "job-restore-1")
	if err != nil || len(jobs) != 1 {
		t.Fatalf("select: %v, jobs %d", err, len(jobs))
	}

	result, err := restoreJobs(ctx, h, restoreRequest{Archive: scope, AccountID: restoreScratchAccount, Jobs: jobs, SessionID: "sess-1"})
	if err != nil {
		t.Fatalf("restoreJobs: %v", err)
	}
	if len(result.RestoredJobIDs) != 1 {
		t.Fatalf("restored %d jobs, want 1", len(result.RestoredJobIDs))
	}

	restored, err := mongo.JobDocuments.LoadJobByID(ctx, models.AccountOwner(restoreScratchAccount), "job-restore-1")
	if err != nil {
		t.Fatalf("the job is not on the planner: %v", err)
	}
	if !restored.MetaData.ArchivedAt.IsZero() || restored.MetaData.ArchivedBy != "" {
		t.Fatalf("restored job still carries its archive stamps: %+v", restored.MetaData)
	}

	held, err := mongo.ArchivedJobs.Collection().CountDocuments(ctx, bson.M{"_id": "job-restore-1"})
	if err != nil || held != 0 {
		t.Fatalf("archived document survived the restore: count %d, err %v", held, err)
	}

	var row models.ArchivedJobStats
	if err := mongo.StatisticsRows.Collection().FindOne(ctx,
		bson.M{"_id": eipmongo.ArchivedJobStatsDocumentID(models.AccountOwner(restoreScratchAccount), "job-restore-1")},
	).Decode(&row); err != nil {
		t.Fatalf("statistics row: %v", err)
	}
	if !row.Revoked || row.ContributedAt == nil {
		t.Fatalf("row is revoked=%v contributedAt=%v, want revoked with its stamp", row.Revoked, row.ContributedAt)
	}

	var entry struct {
		Work string `bson:"work"`
	}
	if err := mongo.StatisticsRebuildQueue.Collection().FindOne(ctx,
		bson.M{"_id": models.AccountOwner(restoreScratchAccount).Key()},
	).Decode(&entry); err != nil {
		t.Fatalf("no statistics work queued: %v", err)
	}
	if entry.Work != string(eipmongo.StatsWorkDelta) {
		t.Fatalf("queued %q, want a delta: taking one job back out is not a rebuild", entry.Work)
	}
}

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
	group.MetaData.Owner = models.AccountOwner(restoreScratchAccount)
	if _, err := mongo.Groups.UpsertStructPreservingMeta(ctx, group, group.GroupID); err != nil {
		t.Fatalf("seed group: %v", err)
	}

	scope, err := plannerArchiveScope(mongo, models.AccountOwner(restoreScratchAccount))
	if err != nil {
		t.Fatalf("archive scope: %v", err)
	}
	jobs, _, err := selectArchivedJobs(ctx, scope, selectionGroup, "group-restore-1")
	if err != nil || len(jobs) != 1 {
		t.Fatalf("select by group: %v, jobs %d", err, len(jobs))
	}
	if _, err := restoreJobs(ctx, h, restoreRequest{Archive: scope, AccountID: restoreScratchAccount, Jobs: jobs, SessionID: "sess-2"}); err != nil {
		t.Fatalf("restoreJobs: %v", err)
	}

	stored, err := mongo.Groups.LoadGroupByID(ctx, models.AccountOwner(restoreScratchAccount), "group-restore-1")
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

func TestLive_restoreStripsAnEsiIdAnotherJobAlreadyHolds(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	mongolive.ScratchAccount(t, mongo, restoreScratchAccount)

	h := restoreHandlers(t, mongo)
	now := time.Now().UTC()

	const contested, free = 4242, 4243
	holder := seedJob("job-restore-holder")
	holder.ESI.LinkedJobs = map[string]models.LinkedESIJob{
		strconv.Itoa(contested): {JobID: contested},
	}
	mongolive.SeedJobs(t, ctx, mongo, models.AccountOwner(restoreScratchAccount), restoreScratchAccount, holder)

	archived := seedJob("job-restore-contested")
	archived.ESI.LinkedJobs = map[string]models.LinkedESIJob{
		strconv.Itoa(contested): {JobID: contested},
		strconv.Itoa(free):      {JobID: free},
	}
	archiveJob(t, ctx, h, archived, now)

	scope, err := plannerArchiveScope(mongo, models.AccountOwner(restoreScratchAccount))
	if err != nil {
		t.Fatalf("archive scope: %v", err)
	}
	jobs, _, err := selectArchivedJobs(ctx, scope, selectionJob, "job-restore-contested")
	if err != nil || len(jobs) != 1 {
		t.Fatalf("select: %v, jobs %d", err, len(jobs))
	}

	result, err := restoreJobs(ctx, h, restoreRequest{Archive: scope, AccountID: restoreScratchAccount, Jobs: jobs, SessionID: "sess-3"})
	if err != nil {
		t.Fatalf("restoreJobs: %v", err)
	}
	if len(result.Conflicts) != 1 || result.Conflicts[0].ID != contested {
		t.Fatalf("conflicts %+v, want the one id another job holds", result.Conflicts)
	}
	if len(result.RestoredJobIDs) != 1 {
		t.Fatal("a contested link should not stop the job coming back")
	}

	restored, err := mongo.JobDocuments.LoadJobByID(ctx, models.AccountOwner(restoreScratchAccount), "job-restore-contested")
	if err != nil {
		t.Fatalf("load restored job: %v", err)
	}
	if slices.Contains(restored.LinkedESIJobIDs(), contested) {
		t.Fatalf("restored job kept an id another job holds: %v", restored.LinkedESIJobIDs())
	}
	if !slices.Contains(restored.LinkedESIJobIDs(), free) {
		t.Fatalf("restored job lost an uncontested id: %v", restored.LinkedESIJobIDs())
	}
}

func TestLive_restoreRefusesAJobAlreadyOnThePlanner(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	mongolive.ScratchAccount(t, mongo, restoreScratchAccount)

	h := restoreHandlers(t, mongo)
	now := time.Now().UTC()
	live := seedJob("job-restore-twice")
	live.Name = "already on the planner"
	mongolive.SeedJobs(t, ctx, mongo, models.AccountOwner(restoreScratchAccount), restoreScratchAccount, live)
	archiveJob(t, ctx, h, seedJob("job-restore-twice"), now)

	scope, err := plannerArchiveScope(mongo, models.AccountOwner(restoreScratchAccount))
	if err != nil {
		t.Fatalf("archive scope: %v", err)
	}
	jobs, _, err := selectArchivedJobs(ctx, scope, selectionJob, "job-restore-twice")
	if err != nil || len(jobs) != 1 {
		t.Fatalf("select: %v, jobs %d", err, len(jobs))
	}

	if _, err := restoreJobs(ctx, h, restoreRequest{Archive: scope, AccountID: restoreScratchAccount, Jobs: jobs}); err == nil {
		t.Fatal("restore over a job already on the planner succeeded")
	}

	if kept := mongolive.ReadJob(t, ctx, mongo.JobDocuments, models.AccountOwner(restoreScratchAccount), "job-restore-twice"); kept.Name != "already on the planner" {
		t.Fatalf("live job = %q, want it left as it was", kept.Name)
	}
	mongolive.ReadJob(t, ctx, mongo.ArchivedJobs, models.AccountOwner(restoreScratchAccount), "job-restore-twice")
}
