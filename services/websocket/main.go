package main

import (
	"context"
	"net/http"
	"time"

	"eve-industry-planner/shared/core/config"
	"eve-industry-planner/shared/shared"
	"eve-industry-planner/shared/shared/logs"
	"eve-industry-planner/shared/shared/metrics"
	wsserver "eve-industry-planner/websocket/server"
)

func StartWSServer(clients *shared.ServiceClients) error {
	cfg, err := config.LoadConfig()
	if err != nil {
		return err
	}

	wsServer := wsserver.NewServer(clients)

	http.HandleFunc("/ws", wsServer.HandleWS)
	http.HandleFunc("/ws/", wsServer.HandleWS)

	addr := ":" + cfg.WS_PORT
	logs.Info("ws server starting", "addr", addr)

	return http.ListenAndServe(addr, nil)
}

func main() {
	// create signal-aware context first so we can cancel on startup failures
	ctx, cancel := shared.NewSignalContext(context.Background())

	// Connect to required services
	clients, err := shared.ConnectServices(ctx, shared.ServiceMongo, shared.ServiceNATS, shared.ServiceRedis)
	if err != nil {
		shared.ShutdownOnError(ctx, cancel, clients, err, 5*time.Second)
		return
	}

	logs.Debug("websocket service running")

	// Start metrics logger for Dozzle viewing (logs every 60 seconds)
	metrics.StartWebSocketMetricsLogger(60 * time.Second)

	go func() {
		if err := StartWSServer(clients); err != nil {
			logs.Error("failed to start websocket server", "err", err)
			shared.ShutdownOnError(ctx, cancel, clients, err, 5*time.Second)
		}
	}()

	// normal blocking shutdown path
	shared.WaitForShutdown(ctx, 5*time.Second, clients.CleanupFns...)
}
