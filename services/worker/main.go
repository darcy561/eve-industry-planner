package main

import (
	"context"
	"eve-industry-planner/shared/lifecycle"
	"eve-industry-planner/shared/stackservices"

	"eve-industry-planner/shared/logs"
	esiratelimiter "eve-industry-planner/worker/ratelimiter"

	"github.com/hibiken/asynq"
)

// WorkerDependencies holds all dependencies needed by worker subscribers.
type WorkerDependencies struct {
	*stackservices.Clients
	ESIClient   esiratelimiter.ClientInterface
	AsynqClient *asynq.Client
}

func (d *WorkerDependencies) GetClients() *stackservices.Clients {
	return d.Clients
}

func (d *WorkerDependencies) GetESIClient() esiratelimiter.ClientInterface {
	return d.ESIClient
}

func main() {
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
			return
		}
	}

	logs.InfoCtx(ctx, "worker service running")
	lifecycle.WaitForShutdown(ctx, shutdownTimeout, a.cleanups()...)
}
