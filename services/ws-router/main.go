package main

import (
	"context"
	"eve-industry-planner/shared/lifecycle"
	"log"
)

func main() {
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
			return
		}
	}

	log.Printf("ws-router listening on %s (service=%s nats=%s)",
		a.cfg.ListenAddr, a.cfg.WebsocketService, a.nc.ConnectedUrl())
	lifecycle.WaitForShutdown(ctx, shutdownTimeout, a.cleanups()...)
}
