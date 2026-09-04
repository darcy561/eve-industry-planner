package main

import (
	"context"
	"eve-industry-planner/shared/stackservices"
	"fmt"
	"os"
	"time"

	"eve-industry-planner/shared/container"
	"eve-industry-planner/shared/esiclient"
	"eve-industry-planner/shared/lifecycle"
	eipnats "eve-industry-planner/shared/nats"
	"eve-industry-planner/shared/orchestrationprobes"
	"eve-industry-planner/shared/telemetry"
	asynqpkg "eve-industry-planner/worker/asynq"

	"eve-industry-planner/shared/crypto/entityid"
	"github.com/hibiken/asynq"
)

const shutdownTimeout = 5 * time.Second

type app struct {
	g        lifecycle.Group
	stopDeps func(context.Context)
	clients  *stackservices.Clients
	deps     *WorkerDependencies
	redisOpt asynq.RedisClientOpt
	initErr  error
}

func (a *app) cleanups() []func(context.Context) {
	return lifecycle.AppThenDeps(a.g.Cleanups(), a.stopDeps)
}

func (a *app) cleanupIfFailed() {
	if a.initErr == nil {
		return
	}
	lifecycle.RunCleanups(shutdownTimeout, a.cleanups()...)
}

func (a *app) fail(err error) error {
	a.initErr = err
	return err
}

func (a *app) connectDeps(ctx context.Context) error {
	teleShutdown, err := telemetry.Init(ctx, telemetry.DefaultConfig("worker"))
	if err != nil {
		return a.fail(err)
	}
	a.g.AddApp(func(c context.Context) { _ = teleShutdown(c) })

	clients, stopDeps, err := stackservices.Connect(ctx, stackservices.Services{
		Mongo: true, NATS: true, Redis: true, ObjectStore: true,
	})
	if err != nil {
		return a.fail(err)
	}
	a.clients = clients
	a.stopDeps = stopDeps
	return nil
}

func (a *app) prepare(ctx context.Context) error {
	if _, err := a.clients.NATS.Tasks.Ensure(ctx); err != nil {
		return a.fail(err)
	}

	asynqClient, redisOpt, err := asynqpkg.SetupClient()
	if err != nil {
		return a.fail(err)
	}
	a.redisOpt = redisOpt
	a.g.Add(lifecycle.FromStop("asynq-client", func() { asynqClient.Close() }))
	// Tasks that persist documents convert entity ids to refs, so a missing authz
	// key must stop the worker starting rather than fail individual tasks.
	entityCipher, err := entityid.NewFromEnv()
	if err != nil {
		return a.fail(fmt.Errorf("load authz hmac key for entity refs: %w", err))
	}

	esi, stopESI, err := esiclient.New(a.clients.Redis, esiclient.DefaultConfig())
	if err != nil {
		return a.fail(fmt.Errorf("build esi client: %w", err))
	}
	a.g.Add(lifecycle.FromStop("esi-dispatcher", stopESI))

	// Queue depth is the part of the limiter only this replica knows; the bucket
	// figures it shares with every other replica are reported by core.
	stopESIMetrics, err := esiclient.RegisterMetrics(esi.Dispatcher())
	if err != nil {
		return a.fail(fmt.Errorf("register esi metrics: %w", err))
	}
	a.g.Add(lifecycle.FromStop("esi-metrics", func() { _ = stopESIMetrics() }))

	a.deps = &WorkerDependencies{
		Clients:      a.clients,
		ESI:          esi,
		AsynqClient:  asynqClient,
		EntityCipher: entityCipher,
	}
	return nil
}

func (a *app) startAsynq(context.Context) error {
	serverCleanup, err := asynqpkg.SetupServer(a.redisOpt, a.deps)
	if err != nil {
		return a.fail(err)
	}
	a.g.Add(lifecycle.Func{RunnerName: "asynq-server", Fn: serverCleanup})
	return nil
}

func (a *app) startSubscribers(context.Context) error {
	scheduledTasksCleanup, err := SubscribeScheduledTasks(a.deps)
	if err != nil {
		return a.fail(err)
	}
	a.g.Add(lifecycle.Func{RunnerName: "scheduled-tasks", Fn: scheduledTasksCleanup})
	return nil
}

func (a *app) startProbes(ctx context.Context) error {
	ready := func(c context.Context) error {
		if err := a.clients.Redis.Ping(c).Err(); err != nil {
			return fmt.Errorf("redis: %w", err)
		}
		if a.clients.NATS == nil || !a.clients.NATS.Connected() {
			return fmt.Errorf("nats not connected")
		}
		if err := a.clients.Mongo.Ping(c); err != nil {
			return fmt.Errorf("mongo: %w", err)
		}
		return nil
	}
	probes, err := orchestrationprobes.Start(ctx, ready, nil)
	if err != nil {
		return a.fail(err)
	}
	a.g.Add(probes)

	bus, err := orchestrationprobes.StartBus(ctx, orchestrationprobes.BusOptions{
		Role:       "worker",
		InstanceID: container.ID(),
		NATS:       a.clients.NATS,
		Ready:      ready,
		Enabled:    true,
		Fill: func(st *eipnats.HealthStatus) {
			if st != nil {
				st.AppVersion = os.Getenv("APP_VERSION")
			}
		},
	})
	if err != nil {
		return a.fail(err)
	}
	a.g.Add(bus)
	return nil
}
