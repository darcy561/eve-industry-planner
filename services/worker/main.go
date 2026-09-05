package main

import (
	"context"
	"os"

	"eve-industry-planner/shared/lifecycle"

	"eve-industry-planner/shared/logs"
)

func main() {
	os.Exit(run())
}

// run returns the process exit code; non-zero on init failure so Swarm restarts the task
// instead of recording a clean stop.
func run() int {
	ctx, cancel := lifecycle.NewSignalContext(context.Background())
	defer cancel()

	var a app
	defer a.cleanupIfFailed()

	for _, phase := range []func(context.Context) error{
		a.connectDeps,
		a.prepare,
		a.startProbes,
		a.startAsynq,
		a.startSubscribers,
	} {
		if err := phase(ctx); err != nil {
			logs.ErrorCtx(ctx, "initialization failed", "error", err)
			cancel()
			return 1
		}
	}

	logs.InfoCtx(ctx, "worker service running")
	lifecycle.WaitForShutdown(ctx, shutdownTimeout, a.cleanups()...)
	return 0
}
