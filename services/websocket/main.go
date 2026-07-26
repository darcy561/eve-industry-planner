package main

import (
	"context"
	"eve-industry-planner/shared/lifecycle"

	"eve-industry-planner/shared/logs"
)

func main() {
	ctx, cancel := lifecycle.NewSignalContext(context.Background())
	defer cancel()

	var a app
	defer a.cleanupIfFailed()

	for _, phase := range []func(context.Context) error{
		a.connectDeps,
		a.startProbes,
		a.startServer,
	} {
		if err := phase(ctx); err != nil {
			logs.ErrorCtx(ctx, "initialization failed", "error", err)
			cancel()
			return
		}
	}

	logs.DebugCtx(ctx, "websocket service running")
	lifecycle.WaitForShutdown(ctx, shutdownTimeout, a.cleanups()...)
}
