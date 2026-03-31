package main

import (
	"context"
	"os"
	"time"

	"eve-industry-planner/core/changestream"
	"eve-industry-planner/core/commands"
	"eve-industry-planner/core/scheduler"
	"eve-industry-planner/core/startup"
	"eve-industry-planner/shared/shared"
	"eve-industry-planner/shared/shared/logs"
)

func main() {
	// signal-aware context first
	ctx, cancel := shared.NewSignalContext(context.Background())
	defer cancel()

	// Command mode (e.g. docker exec core-service /app/core-service tasks ...)
	handled, err := commands.Handle(ctx, os.Args[1:])
	if err != nil {
		logs.Error("command failed", "error", err)
		os.Exit(1)
	}
	if handled {
		return
	}

	logs.Info("core startup checks starting")

	// Connect to required services (primary MongoDB for scheduler)
	clients, err := shared.ConnectServices(ctx, shared.ServiceMongo, shared.ServiceNATS, shared.ServiceRedis)
	if err != nil {
		shared.ShutdownOnError(ctx, cancel, clients, err, 5*time.Second)
		return
	}

	// Run startup checks that must complete before the rest of the system is considered ready.
	// Today this primarily validates/bootstraps Static Data Export (SDE) files under /static-data.
	if err := startup.EnsureSDEStaticDataReady(ctx, clients); err != nil {
		shared.ShutdownOnError(ctx, cancel, clients, err, 5*time.Second)
		return
	}
	logs.Info("core service running")

	// Start scheduler service (runs in background goroutines)
	schedulerStop, err := scheduler.StartService("scheduler", clients.NATS, clients.JetStream, clients.Redis, clients.Mongo)
	if err != nil {
		shared.ShutdownOnError(ctx, cancel, clients, err, 5*time.Second)
		return
	}
	clients.CleanupFns = append(clients.CleanupFns, func(c context.Context) { schedulerStop() })

	// Start change stream watcher (runs in background goroutine)
	changestreamStop := changestream.StartService(clients.Mongo, clients.JetStream)
	clients.CleanupFns = append(clients.CleanupFns, func(c context.Context) { changestreamStop() })

	// Mark core as healthy/ready for dependent services (e.g. api) via docker healthcheck.
	if err := startup.WriteCoreReadyMarker(); err != nil {
		shared.ShutdownOnError(ctx, cancel, clients, err, 5*time.Second)
		return
	}

	// normal blocking shutdown
	shared.WaitForShutdown(ctx, 5*time.Second, clients.CleanupFns...)
}
