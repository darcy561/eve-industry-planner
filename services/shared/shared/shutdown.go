package shared

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"
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

// WaitForShutdown blocks until the context is cancelled, then runs cleanup fns with a per-fn timeout.
func WaitForShutdown(ctx context.Context, timeoutPerFn time.Duration, cleanups ...func(context.Context)) {
	<-ctx.Done()
	log.Println("shutting down...")
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
}
