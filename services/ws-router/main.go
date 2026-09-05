package main

import (
	"context"
	"os"

	"eve-industry-planner/shared/lifecycle"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/telemetry"
)

func main() {
	os.Exit(run())
}

// run returns the process exit code; non-zero on init failure so Swarm restarts the task
// instead of recording a clean stop.
func run() int {
	ctx, cancel := lifecycle.NewSignalContext(context.Background())
	defer cancel()

	teleShutdown, err := telemetry.Init(ctx, telemetry.DefaultConfig("ws-router"))
	if err != nil {
		logs.ErrorCtx(ctx, "ws-router: telemetry init failed", "error", err)
		return 1
	}
	defer func() {
		shutdownCtx, stop := context.WithTimeout(context.Background(), shutdownTimeout)
		defer stop()
		if err := teleShutdown(shutdownCtx); err != nil {
			logs.ErrorCtx(shutdownCtx, "ws-router: telemetry shutdown failed", "error", err)
		}
		_ = logs.Sync()
	}()

	var a app
	defer a.cleanupIfFailed()

	for _, phase := range []func(context.Context) error{
		a.connectDeps,
		a.startDiscovery,
		a.startProbes,
		a.startHTTP,
	} {
		if err := phase(ctx); err != nil {
			logs.ErrorCtx(ctx, "ws-router: initialization failed", "error", err)
			cancel()
			return 1
		}
	}

	logs.InfoCtx(ctx, "ws-router listening",
		"listen_addr", a.cfg.ListenAddr,
		"websocket_service", a.cfg.WebsocketService,
		"nats_url", a.nats.Conn().ConnectedUrl())
	lifecycle.WaitForShutdown(ctx, shutdownTimeout, a.cleanups()...)
	return 0
}
