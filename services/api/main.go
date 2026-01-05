package main

import (
	"context"
	"time"

	"eve-industry-planner/shared/shared"
	"eve-industry-planner/shared/shared/logs"
	"eve-industry-planner/shared/shared/metrics"
)

func main() {
	// create signal-aware context first so we can cancel on startup failures
	ctx, cancel := shared.NewSignalContext(context.Background())

	// Connect to required services
	clients, err := shared.ConnectServices(ctx, shared.ServiceMongo, shared.ServiceNATS, shared.ServiceRedis)
	if err != nil {
		shared.ShutdownOnError(ctx, cancel, clients, err, 5*time.Second)
		return
	}

	logs.Debug("api service running")

	// Start metrics logger for Dozzle viewing (logs every 60 seconds)
	metrics.StartAPIMetricsLogger(60 * time.Second)
	metrics.StartWebSocketMetricsLogger(60 * time.Second)

	go func() {
		if err := StartAPIServer(clients); err != nil {
			logs.Error("failed to start api server", "err", err)
			shared.ShutdownOnError(ctx, cancel, clients, err, 5*time.Second)
			return
		}
	}()

	go func() {
		if err := StartWSServer(clients); err != nil {
			logs.Error("failed to start websocket server", "err", err)
		}
	}()

	// normal blocking shutdown path
	shared.WaitForShutdown(ctx, 5*time.Second, clients.CleanupFns...)
}
