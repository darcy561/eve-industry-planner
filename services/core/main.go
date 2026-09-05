package main

import (
	"context"
	"eve-industry-planner/shared/lifecycle"
	"os"

	"eve-industry-planner/core/commands"
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

	handled, err := commands.Handle(ctx, os.Args[1:])
	if err != nil {
		logs.ErrorCtx(ctx, "command failed", "error", err)
		return 1
	}
	if handled {
		return 0
	}

	var a app
	defer a.cleanupIfFailed()

	for _, phase := range []func(context.Context) error{
		a.connectDeps,
		a.prepare,
		a.startProbes,
		a.startServices,
	} {
		if err := phase(ctx); err != nil {
			logs.ErrorCtx(ctx, "initialization failed", "error", err)
			cancel()
			return 1
		}
	}

	logs.InfoCtx(ctx, "core service running")
	lifecycle.WaitForShutdown(ctx, shutdownTimeout, a.cleanups()...)
	return 0
}
