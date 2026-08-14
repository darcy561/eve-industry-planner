package main

import (
	"context"
	"eve-industry-planner/shared/lifecycle"
	"os"

	"eve-industry-planner/core/commands"
	"eve-industry-planner/shared/logs"
)

func main() {
	ctx, cancel := lifecycle.NewSignalContext(context.Background())
	defer cancel()

	handled, err := commands.Handle(ctx, os.Args[1:])
	if err != nil {
		logs.ErrorCtx(ctx, "command failed", "error", err)
		os.Exit(1)
	}
	if handled {
		return
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
			return
		}
	}

	logs.InfoCtx(ctx, "core service running")
	lifecycle.WaitForShutdown(ctx, shutdownTimeout, a.cleanups()...)
}
