package mongolive

import (
	"context"
	"errors"
	"testing"
	"time"

	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"

	mongodriver "go.mongodb.org/mongo-driver/v2/mongo"
)

// SeedJobs writes jobs onto an owner's planner as accountID, failing the test if any is refused.
func SeedJobs(t *testing.T, ctx context.Context, mongo *eipmongo.Mongo, owner models.Owner, accountID string, jobs ...models.Job) {
	t.Helper()
	_, failed, conflicts, err := mongo.JobDocuments.BulkUpsertJobs(ctx, owner, accountID, jobs, time.Now().UTC(), "", "")
	if err != nil || len(failed) != 0 || len(conflicts) != 0 {
		t.Fatalf("seed jobs: failed=%v conflicts=%+v err=%v", failed, conflicts, err)
	}
}

// ReadJob reads one job from a job collection, failing the test when it is not there.
func ReadJob(t *testing.T, ctx context.Context, docs *eipmongo.Docs, owner models.Owner, jobID string) models.Job {
	t.Helper()
	job, err := docs.LoadJobByID(ctx, owner, jobID)
	if err != nil {
		t.Fatalf("read %s: %v", jobID, err)
	}
	return job
}

// RequireJobAbsent fails the test when a job collection holds the job.
func RequireJobAbsent(t *testing.T, ctx context.Context, docs *eipmongo.Docs, owner models.Owner, jobID string) {
	t.Helper()
	if _, err := docs.LoadJobByID(ctx, owner, jobID); !errors.Is(err, mongodriver.ErrNoDocuments) {
		t.Errorf("%s: err = %v, want it absent", jobID, err)
	}
}
