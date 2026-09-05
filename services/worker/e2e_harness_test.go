package main

import (
	"context"
	"testing"

	eipnats "eve-industry-planner/shared/nats"
	"eve-industry-planner/testing/esifake"
	"eve-industry-planner/testing/natsfake"
	"eve-industry-planner/testing/redisfake"
	asynqpkg "eve-industry-planner/worker/asynq"
	"eve-industry-planner/worker/taskrun"

	"github.com/hibiken/asynq"
)

// A worker with both halves of its pipeline running: the JetStream consumer that
// receives published tasks, and the asynq server that executes them.
//
// Everything below the worker is in-process — an embedded NATS with JetStream,
// a miniredis behind both asynq and the task's own storage, and a stand-in ESI.
// What is *not* faked is the worker: tasks are published through the same
// helpers api and core use, resolved by the same subscriber, queued by the same
// bridge, and run by the same handlers on the same mux. That is what makes these
// end to end rather than a wiring test — a unit test cannot see the meaning of a
// message change between the side that sends it and the side that runs it.
type workerStack struct {
	NATS  *eipnats.NATS
	Redis *redisfake.Redis
	ESI   *esifake.Client
	// Inspector reads the queue the way the capacity controller and the operator
	// CLI do, so a test can ask what the queue decided rather than inferring it.
	Inspector *asynq.Inspector
}

// startWorker brings a worker up against fakes and tears it down with the test.
func startWorker(t *testing.T) *workerStack {
	t.Helper()

	nats := natsfake.New(t)
	if _, err := nats.NATS.Tasks.Ensure(t.Context()); err != nil {
		t.Fatalf("ensure task stream: %v", err)
	}

	redis := redisfake.New(t)
	redisOpt := asynq.RedisClientOpt{Addr: redis.Addr()}

	client := asynq.NewClient(redisOpt)
	t.Cleanup(func() { _ = client.Close() })

	esi := esifake.New(t)
	deps := &taskrun.Dependencies{
		NATS:  nats.NATS,
		Redis: redis.Client,
		ESI:   esi,
	}

	// The real registration path, so a task with no handler fails here exactly as
	// it would at boot.
	stopServer, err := asynqpkg.SetupServer(redisOpt, deps)
	if err != nil {
		t.Fatalf("asynq server: %v", err)
	}
	stopSubscriber, err := SubscribeScheduledTasks(nats.NATS, client)
	if err != nil {
		t.Fatalf("task subscriber: %v", err)
	}

	// Stop in the order the worker stops in: intake first, then the drain.
	t.Cleanup(func() {
		stopSubscriber(context.Background())
		stopServer(context.Background())
	})

	inspector := asynq.NewInspector(redisOpt)
	t.Cleanup(func() { _ = inspector.Close() })

	return &workerStack{NATS: nats.NATS, Redis: redis, ESI: esi, Inspector: inspector}
}
