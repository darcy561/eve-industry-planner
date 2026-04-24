package main

import (
	"context"
	"net/http"
	"time"

	"eve-industry-planner/api/middleware"
	"eve-industry-planner/shared/core/config"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/shared"
	"eve-industry-planner/shared/telemetry"
	wsserver "eve-industry-planner/websocket/server"
)

func StartWSServer(ctx context.Context, clients *shared.ServiceClients) error {
	cfg, err := config.LoadConfig()
	if err != nil {
		return err
	}

	wsServer := wsserver.NewServer(clients)

	// Request start time + scoped logger (request_id, trace fields when present).
	// Do not wrap with otelhttp here: gorilla/websocket Upgrade requires ResponseWriter to implement
	// http.Hijacker; otelhttp's response wrapper does not, which breaks all upgrades ("response does not implement http.Hijacker").
	core := http.HandlerFunc(wsServer.HandleWS)
	h := middleware.RequestStartTimeConstructor()(
		middleware.RequestLoggingConstructor()(core),
	)

	mux := http.NewServeMux()
	mux.Handle("/ws", h)
	mux.Handle("/ws/", h)

	addr := ":" + cfg.WS_PORT
	logs.InfoCtx(ctx, "ws server starting", "addr", addr)

	return http.ListenAndServe(addr, mux)
}

func main() {
	// create signal-aware context first so we can cancel on startup failures
	ctx, cancel := shared.NewSignalContext(context.Background())

	teleShutdown, err := telemetry.Init(ctx, telemetry.DefaultConfig("websocket"))
	if err != nil {
		logs.ErrorCtx(ctx, "telemetry init failed", "err", err)
		cancel()
		return
	}

	// Connect to required services
	clients, err := shared.ConnectServices(ctx, shared.ServiceMongo, shared.ServiceNATS, shared.ServiceRedis)
	if err != nil {
		sctx, sdone := context.WithTimeout(context.Background(), 5*time.Second)
		_ = teleShutdown(sctx)
		sdone()
		shared.ShutdownOnError(ctx, cancel, clients, err, 5*time.Second)
		return
	}
	ts := teleShutdown
	clients.CleanupFns = append(clients.CleanupFns, func(c context.Context) { _ = ts(c) })

	logs.DebugCtx(ctx, "websocket service running")

	go func() {
		if err := StartWSServer(ctx, clients); err != nil {
			logs.ErrorCtx(ctx, "failed to start websocket server", "err", err)
			shared.ShutdownOnError(ctx, cancel, clients, err, 5*time.Second)
		}
	}()

	// normal blocking shutdown path
	shared.WaitForShutdown(ctx, 5*time.Second, clients.CleanupFns...)
}
