package sync

import (
	"context"
	"testing"
	"time"

	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"
	"eve-industry-planner/testing/mongolive"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// mongoOnlyServer satisfies SyncServer for a query that needs nothing else.
//
// The sync path is wide, but QueryAllJobsForAccount reads one field off it, so a
// full fake would be scaffolding around the one method under test.
type mongoOnlyServer struct {
	SyncServer
	mongo *eipmongo.Mongo
}

func (s mongoOnlyServer) GetMongoClient() any { return s.mongo }

const plannerSyncScratchAccount = "eip-parity-planner-sync-account"

// The sync reads the collection that holds jobs.
//
// A query naming a collection nothing writes returns an empty result, and an
// account with no jobs returns the same — so the fault reports nothing and the
// sync payload silently omits the jobs key. That is what this holds: seeded jobs
// come back, and the one hidden from the planner does not.
//
// Requires EIP_MONGO_PARITY_LIVE=1.
func TestLive_plannerSyncReadsTheCollectionThatHoldsJobs(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()

	mongolive.ScratchAccount(t, mongo, plannerSyncScratchAccount)

	shown := models.Job{JobID: "job-sync-shown", Name: "on the planner", ItemID: 34, JobType: 1,
		DisplayOnPlanner: true}
	hidden := models.Job{JobID: "job-sync-hidden", Name: "off the planner", ItemID: 34, JobType: 1,
		DisplayOnPlanner: false}

	if _, failed, err := mongo.JobDocuments.BulkUpsertJobs(
		ctx, plannerSyncScratchAccount, []models.Job{shown, hidden}, time.Now().UTC(), "", "",
	); err != nil || failed != 0 {
		t.Fatalf("seed jobs: failed=%d err=%v", failed, err)
	}

	got, err := QueryAllJobsForAccount(ctx, mongoOnlyServer{mongo: mongo}, plannerSyncScratchAccount)
	if err != nil {
		t.Fatalf("QueryAllJobsForAccount: %v", err)
	}

	if _, ok := got["job-sync-shown"]; !ok {
		t.Fatalf("the sync returned %d jobs and not the one on the planner: %v", len(got), keysOf(got))
	}
	if _, ok := got["job-sync-hidden"]; ok {
		t.Fatal("a job not shown on the planner reached the sync")
	}
}

// The sync and the HTTP planner read serve the same jobs, so they must agree.
// They are written apart and could drift onto different collections or filters.
//
// Requires EIP_MONGO_PARITY_LIVE=1.
func TestLive_plannerSyncAgreesWithTheHTTPPlannerRead(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()

	mongolive.ScratchAccount(t, mongo, plannerSyncScratchAccount)

	job := models.Job{JobID: "job-sync-agree", Name: "agreed", ItemID: 34, JobType: 1,
		DisplayOnPlanner: true}
	if _, failed, err := mongo.JobDocuments.BulkUpsertJobs(
		ctx, plannerSyncScratchAccount, []models.Job{job}, time.Now().UTC(), "", "",
	); err != nil || failed != 0 {
		t.Fatalf("seed job: failed=%d err=%v", failed, err)
	}

	synced, err := QueryAllJobsForAccount(ctx, mongoOnlyServer{mongo: mongo}, plannerSyncScratchAccount)
	if err != nil {
		t.Fatalf("QueryAllJobsForAccount: %v", err)
	}

	// The filter the HTTP planner handler builds.
	overHTTP, err := mongo.JobDocuments.LoadJobsByFilter(ctx, plannerSyncScratchAccount, bson.M{
		eipmongo.FieldMetaOwnerKind: models.OwnerAccount,
		eipmongo.FieldMetaOwnerID:   plannerSyncScratchAccount,
		"displayOnPlanner":          true,
	})
	if err != nil {
		t.Fatalf("LoadJobsByFilter: %v", err)
	}

	if len(synced) != len(overHTTP) {
		t.Fatalf("the sync returned %d planner jobs and the HTTP read %d", len(synced), len(overHTTP))
	}
	for _, j := range overHTTP {
		if _, ok := synced[j.JobID]; !ok {
			t.Fatalf("%s reaches the HTTP planner read but not the sync", j.JobID)
		}
	}
}

func keysOf(m map[string]map[string]any) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	return out
}
