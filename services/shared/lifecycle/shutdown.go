package lifecycle

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"eve-industry-planner/shared/logs"
)

// NewSignalContext returns a context that is cancelled on SIGINT/SIGTERM.
func NewSignalContext(parent context.Context) (context.Context, context.CancelFunc) {
	ctx, cancel := context.WithCancel(parent)
	sigs := make(chan os.Signal, 1)
	signal.Notify(sigs, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-sigs
		cancel()
	}()
	return ctx, cancel
}

// RunCleanups runs cleanup fns immediately with a per-fn timeout (CLI one-shots / init failure).
func RunCleanups(timeoutPerFn time.Duration, cleanups ...func(context.Context)) {
	for _, fn := range cleanups {
		if fn == nil {
			continue
		}
		cctx, cancel := context.WithTimeout(context.Background(), timeoutPerFn)
		func() {
			defer cancel()
			fn(cctx)
		}()
	}
	_ = logs.Sync()
}

// WaitForShutdown blocks until the context is cancelled, then runs cleanup fns with a per-fn timeout.
func WaitForShutdown(ctx context.Context, timeoutPerFn time.Duration, cleanups ...func(context.Context)) {
	<-ctx.Done()
	log.Println("shutting down...")
	RunCleanups(timeoutPerFn, cleanups...)
}

// ShutdownOnError cancels the process context and runs cleanups (app then deps).
func ShutdownOnError(ctx context.Context, cancel context.CancelFunc, err error, timeout time.Duration, cleanups ...func(context.Context)) {
	logs.ErrorCtx(ctx, "initialization failed", "error", err)
	if cancel != nil {
		cancel()
	}
	RunCleanups(timeout, cleanups...)
}
