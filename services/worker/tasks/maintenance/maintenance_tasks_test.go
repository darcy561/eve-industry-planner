package maintenance

import (
	"context"
	"encoding/json"
	"testing"

	natscore "eve-industry-planner/shared/core/nats"
	"eve-industry-planner/shared/shared"
	esitasks "eve-industry-planner/worker/tasks/esi"

	"github.com/hibiken/asynq"
)

func encodeAsynqWrappedPayload(t *testing.T, taskType string, inner any) []byte {
	t.Helper()
	innerBytes, err := json.Marshal(inner)
	if err != nil {
		t.Fatal(err)
	}
	outer := struct {
		TaskType string          `json:"task_type"`
		Data     json.RawMessage `json:"data"`
	}{TaskType: taskType, Data: innerBytes}
	b, err := json.Marshal(outer)
	if err != nil {
		t.Fatal(err)
	}
	return b
}

func depsMongoNil() *esitasks.TaskDependencies {
	return &esitasks.TaskDependencies{ServiceClients: &shared.ServiceClients{}}
}

func TestCloudStoredEsiRefreshMaintenance_Validation(t *testing.T) {
	t.Parallel()
	ctx := context.Background()

	t.Run("nil_task", func(t *testing.T) {
		err := CloudStoredEsiRefreshMaintenance(ctx, nil, depsMongoNil())
		if err == nil || err.Error() != "task is nil" {
			t.Fatalf("got %v", err)
		}
	})

	t.Run("nil_mongo", func(t *testing.T) {
		task := asynq.NewTask("x", encodeAsynqWrappedPayload(t, "task.maintenance.cloudStoredEsiRefreshMaintenance",
			natscore.CloudStoredEsiRefreshMaintenanceRequest{AccountID: "a"}))
		err := CloudStoredEsiRefreshMaintenance(ctx, task, depsMongoNil())
		if err == nil || err.Error() != "mongo client is required" {
			t.Fatalf("got %v", err)
		}
	})

	t.Run("invalid_payload", func(t *testing.T) {
		task := asynq.NewTask("x", []byte(`not-json`))
		err := CloudStoredEsiRefreshMaintenance(ctx, task, depsMongoNil())
		if err == nil {
			t.Fatal("expected error")
		}
	})
	// account_id / payload shape checks run after a non-nil Mongo client; cover with integration tests if needed.
}

func TestInactiveAccountPlannerCleanup_Validation(t *testing.T) {
	t.Parallel()
	ctx := context.Background()

	t.Run("nil_task", func(t *testing.T) {
		err := InactiveAccountPlannerCleanup(ctx, nil, depsMongoNil())
		if err == nil || err.Error() != "task is nil" {
			t.Fatalf("got %v", err)
		}
	})

	t.Run("nil_mongo", func(t *testing.T) {
		task := asynq.NewTask("x", encodeAsynqWrappedPayload(t, "task.maintenance.inactiveAccountPlannerCleanup",
			natscore.InactiveAccountPlannerCleanupRequest{AccountID: "a"}))
		err := InactiveAccountPlannerCleanup(ctx, task, depsMongoNil())
		if err == nil || err.Error() != "mongo client is required" {
			t.Fatalf("got %v", err)
		}
	})

	t.Run("invalid_payload", func(t *testing.T) {
		task := asynq.NewTask("x", []byte(`{`))
		err := InactiveAccountPlannerCleanup(ctx, task, depsMongoNil())
		if err == nil {
			t.Fatal("expected error")
		}
	})
}

func TestRotateRefreshTokenKeys_Validation(t *testing.T) {
	t.Parallel()
	ctx := context.Background()

	t.Run("nil_task", func(t *testing.T) {
		err := RotateRefreshTokenKeys(ctx, nil, depsMongoNil())
		if err == nil || err.Error() != "task is nil" {
			t.Fatalf("got %v", err)
		}
	})

	t.Run("nil_mongo", func(t *testing.T) {
		task := asynq.NewTask("x", encodeAsynqWrappedPayload(t, "task.maintenance.rotateRefreshTokenKeys",
			natscore.RotateRefreshTokenKeysRequest{AccountID: "a"}))
		err := RotateRefreshTokenKeys(ctx, task, depsMongoNil())
		if err == nil || err.Error() != "mongo client is required" {
			t.Fatalf("got %v", err)
		}
	})
}
