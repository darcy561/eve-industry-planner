package tasks

import (
	"context"
	"eve-industry-planner/shared/stackservices"
	"testing"

	"github.com/hibiken/asynq"
	"github.com/redis/go-redis/v9"
)

func TestCountMarketPricesItems_NilTask(t *testing.T) {
	ctx := context.Background()
	deps := &TaskDependencies{
		Clients: &stackservices.Clients{
			Redis: redis.NewClient(&redis.Options{Addr: "invalid:6379"}),
		},
		ESIClient: &mockESIClient{},
	}
	err := CountMarketPricesItems(ctx, nil, deps)
	if err == nil {
		t.Fatal("expected error for nil task")
	}
}

func TestCountMarketPricesItems_InvalidRedisSkipsViaLock(t *testing.T) {
	ctx := context.Background()
	task := asynq.NewTask("countMarketPricesItems", []byte(`{}`))
	deps := &TaskDependencies{
		Clients: &stackservices.Clients{
			Redis: redis.NewClient(&redis.Options{Addr: "invalid:6379"}),
		},
		ESIClient: &mockESIClient{},
	}
	// Lock acquisition fails → shouldContinue false → nil return (same as other refresh tasks)
	err := CountMarketPricesItems(ctx, task, deps)
	if err != nil {
		t.Fatalf("expected nil when lock cannot be acquired, got %v", err)
	}
}
