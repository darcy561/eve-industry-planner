package main

import (
	"context"
	"log"
	"os"

	"eve-industry-planner/shared/lifecycle"
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
		a.startDiscovery,
		a.startProbes,
		a.startHTTP,
	} {
		if err := phase(ctx); err != nil {
			log.Printf("initialization failed: %v", err)
			cancel()
			return 1
		}
	}

	log.Printf("ws-router listening on %s (service=%s nats=%s)",
		a.cfg.ListenAddr, a.cfg.WebsocketService, a.nc.ConnectedUrl())
	lifecycle.WaitForShutdown(ctx, shutdownTimeout, a.cleanups()...)
	return 0
}
