package main

import (
	"context"
	"time"

	"eve-industry-planner/core/changestream"
	"eve-industry-planner/core/scheduler"
	"eve-industry-planner/shared/shared"
	"eve-industry-planner/shared/shared/logs"
)

func main() {
	// signal-aware context first
	ctx, cancel := shared.NewSignalContext(context.Background())

	// Connect to required services (primary MongoDB for scheduler)
	clients, err := shared.ConnectServices(ctx, shared.ServiceMongo, shared.ServiceNATS, shared.ServiceRedis)
	if err != nil {
		shared.ShutdownOnError(ctx, cancel, clients, err, 5*time.Second)
		return
	}

	logs.Info("core service running")

	// Start scheduler service (runs in background goroutines)
	schedulerStop := scheduler.StartService("scheduler", clients.NATS, clients.JetStream, clients.Redis, clients.Mongo)
	clients.CleanupFns = append(clients.CleanupFns, func(c context.Context) { schedulerStop() })

	// Start change stream watcher (runs in background goroutine)
	changestreamStop := changestream.StartService(clients.Mongo, clients.JetStream)
	clients.CleanupFns = append(clients.CleanupFns, func(c context.Context) { changestreamStop() })

	// normal blocking shutdown
	shared.WaitForShutdown(ctx, 5*time.Second, clients.CleanupFns...)
}
