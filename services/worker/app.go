package main

import (
	"context"
	"eve-industry-planner/shared/stackservices"
	"fmt"
	"os"
	"time"

	"eve-industry-planner/shared/container"
	natscore "eve-industry-planner/shared/core/nats"
	"eve-industry-planner/shared/lifecycle"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/orchestrationprobes"
	"eve-industry-planner/shared/telemetry"
	asynqpkg "eve-industry-planner/worker/asynq"
	esiratelimiter "eve-industry-planner/worker/ratelimiter"

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
	if err := natscore.EnsureWorkerTaskStream(a.clients.JetStream); err != nil {
		return a.fail(err)
	}

	const defaultRateLimit = 3.0
	esiClient := esiratelimiter.NewRedisESIClient("https://esi.evetech.net", a.clients.Redis, defaultRateLimit)
	rateLimits := map[string]float64{
		"market-order": defaultRateLimit,
		"industry":     defaultRateLimit,
		"characters":   defaultRateLimit,
		"status":       defaultRateLimit,
	}
	if err := esiClient.InitializeDefaultRateLimits(ctx, rateLimits); err != nil {
		logs.ErrorCtx(ctx, "failed to initialize rate limits", "error", err)
	} else {
		logs.InfoCtx(ctx, "rate limits initialized for primary groups", "rate_limits", rateLimits)
	}
	logs.InfoCtx(ctx, "Redis-based ESI rate-limited client initialized (distributed rate limiting enabled)")

	asynqClient, redisOpt, err := asynqpkg.SetupClient()
	if err != nil {
		return a.fail(err)
	}
	a.redisOpt = redisOpt
	a.g.Add(lifecycle.FromStop("asynq-client", func() { asynqClient.Close() }))
	a.deps = &WorkerDependencies{
		Clients:     a.clients,
		ESIClient:   esiClient,
		AsynqClient: asynqClient,
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
		if a.clients.NATS == nil || !a.clients.NATS.IsConnected() {
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
		Conn:       a.clients.NATS,
		Ready:      ready,
		Enabled:    true,
		Fill: func(st *natscore.HealthStatus) {
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
