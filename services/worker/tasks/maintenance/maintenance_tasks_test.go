package maintenance

import (
	"context"
	"testing"

	eipnats "eve-industry-planner/shared/nats"
	"eve-industry-planner/worker/taskrun"
)

func depsMongoNil() *taskrun.Dependencies {
	return &taskrun.Dependencies{}
}

// Each of these runs against a dependency bag with no Mongo in it, so what is
// under test is that the task stops on what it genuinely needs rather than
// getting far enough to touch storage. A malformed or absent request never
// reaches a handler — the mux refuses it — so there is nothing here for that.
func TestMaintenanceTasksStopWithoutMongo(t *testing.T) {
	t.Parallel()
	ctx := context.Background()

	run := map[string]func() error{
		"cloud stored esi refresh": func() error {
			return CloudStoredEsiRefreshMaintenance(ctx,
				eipnats.CloudStoredEsiRefreshMaintenanceRequest{AccountID: "a"}, depsMongoNil())
		},
		"inactive account planner cleanup": func() error {
			return InactiveAccountPlannerCleanup(ctx,
				eipnats.InactiveAccountPlannerCleanupRequest{AccountID: "a"}, depsMongoNil())
		},
		"rotate refresh token keys": func() error {
			return RotateRefreshTokenKeys(ctx,
				eipnats.RotateRefreshTokenKeysRequest{AccountID: "a"}, depsMongoNil())
		},
	}

	for name, fn := range run {
		t.Run(name, func(t *testing.T) {
			err := fn()
			if err == nil || err.Error() != "mongo client is required" {
				t.Fatalf("got %v, want a refusal naming the missing mongo client", err)
			}
		})
	}
}
