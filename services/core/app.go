package main

import (
	"context"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/stackservices"
	"os"
	"time"

	"eve-industry-planner/core/changestream"
	"eve-industry-planner/core/health"
	"eve-industry-planner/core/metrics"
	"eve-industry-planner/core/primarycontroller"
	"eve-industry-planner/core/scheduler"
	"eve-industry-planner/core/sdeensure"
	"eve-industry-planner/core/singleton"
	"eve-industry-planner/core/startup"
	"eve-industry-planner/shared/container"
	"eve-industry-planner/shared/lifecycle"
	eipnats "eve-industry-planner/shared/nats"
	"eve-industry-planner/shared/orchestrationprobes"
	"eve-industry-planner/shared/telemetry"
)

const shutdownTimeout = 5 * time.Second

// app holds wiring state while main walks through startup phases.
type app struct {
	g        lifecycle.Group
	stopDeps func(context.Context)
	clients  *stackservices.Clients
	initErr  error
}

func (a *app) cleanups() []func(context.Context) {
	return lifecycle.AppThenDeps(a.g.Cleanups(), a.stopDeps)
}

// cleanupIfFailed tears down anything started when a later phase returns an error.
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

// connectDeps: telemetry, stack clients, metrics, dep Ready checks.
func (a *app) connectDeps(ctx context.Context) error {
	teleShutdown, err := telemetry.Init(ctx, telemetry.DefaultConfig("core"))
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
	a.g.AddApp(metrics.RegisterAll(clients.Redis, clients.Mongo, clients.NATS)...)
	health.Register(health.Deps(clients))

	// Core owns stream lifecycle: a stream this app made but no longer declares
	// is removed here rather than by hand.
	if _, err := clients.NATS.ReconcileStreams(ctx); err != nil {
		logs.WarnCtx(ctx, "stream reconcile failed", "error", err)
	}
	return nil
}

// prepare: required indexes + warn-continue background reports + sdeensure.
func (a *app) prepare(ctx context.Context) error {
	if err := startup.Prepare(ctx, a.clients); err != nil {
		return a.fail(err)
	}
	lifecycle.GoCtx(ctx, func(c context.Context) { sdeensure.Run(c, a.clients) })
	return nil
}

// startProbes: Swarm/Docker liveness + readiness on :19100 (+ gated NATS census bus).
func (a *app) startProbes(ctx context.Context) error {
	probes, err := orchestrationprobes.Start(ctx, health.Check, nil)
	if err != nil {
		return a.fail(err)
	}
	a.g.Add(probes)

	bus, err := orchestrationprobes.StartBus(ctx, orchestrationprobes.BusOptions{
		Role:       "core",
		InstanceID: container.ID(),
		NATS:       a.clients.NATS,
		Ready:      health.Check,
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

// startServices: primary election, leader-gated work, singletons, unhealthy-lease watch.
func (a *app) startServices(ctx context.Context) error {
	primary, err := primarycontroller.Start(ctx, a.clients.Redis)
	if err != nil {
		return a.fail(err)
	}
	sched, err := scheduler.StartUnderPrimary(ctx, a.clients, primary.Subscribe())
	if err != nil {
		return a.fail(err)
	}
	cs, err := changestream.StartUnderPrimary(ctx, a.clients, primary.Subscribe())
	if err != nil {
		return a.fail(err)
	}
	sing, err := singleton.Start(a.clients)
	if err != nil {
		return a.fail(err)
	}
	// Stop order: leader workloads first, then primary lease release (Mount/Add order = stop order).
	health.Mount(&a.g, sched, cs, sing)
	health.Register(primary)
	a.g.Add(primary)
	primarycontroller.WatchUnhealthyRelease(ctx, primary, health.Check, primarycontroller.DefaultUnhealthyReleaseGrace)
	return nil
}
