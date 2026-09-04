package main

import (
	"context"
	"os"

	"eve-industry-planner/shared/lifecycle"
	"eve-industry-planner/shared/stackservices"

	"eve-industry-planner/shared/esiclient"
	"eve-industry-planner/shared/logs"

	"eve-industry-planner/shared/crypto/entityid"
	"github.com/hibiken/asynq"
)

// WorkerDependencies holds all dependencies needed by worker subscribers.
type WorkerDependencies struct {
	*stackservices.Clients
	ESI          esiclient.API
	AsynqClient  *asynq.Client
	EntityCipher *entityid.Cipher
}

func (d *WorkerDependencies) GetClients() *stackservices.Clients {
	return d.Clients
}

func (d *WorkerDependencies) GetESI() esiclient.API {
	return d.ESI
}

func (d *WorkerDependencies) GetEntityCipher() *entityid.Cipher {
	return d.EntityCipher
}

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
