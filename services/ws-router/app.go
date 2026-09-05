package main

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"eve-industry-planner/shared/lifecycle"
	eipnats "eve-industry-planner/shared/nats"
	"eve-industry-planner/shared/orchestrationprobes"
	"eve-industry-planner/shared/telemetry/wsroutermetrics"
)

const shutdownTimeout = 15 * time.Second

type app struct {
	g        lifecycle.Group
	stopDeps func(context.Context)
	cfg      config
	nats     *eipnats.NATS
	place    *placementStore
	be       *backendRegistry
	initErr  error
}

func (a *app) cleanups() []func(context.Context) {
	return lifecycle.AppThenDeps(a.g.Cleanups(), a.stopDeps)
}

func (a *app) cleanupIfFailed() {
	if a.initErr == nil {
		return
	}
	lifecycle.RunCleanups(shutdownTimeout, a.cleanups()...)
}

func (a *app) fail(err error) error {
	a.initErr = err
	return err
}

func (a *app) connectDeps(ctx context.Context) error {
	a.cfg = loadConfig()
	handle, err := eipnats.Open(ctx)
	if err != nil {
		return a.fail(fmt.Errorf("nats: %w", err))
	}
	a.nats = handle
	a.place = newPlacementStore()
	a.stopDeps = func(context.Context) {
		if a.nats != nil {
			a.nats.Close()
		}
	}
	return nil
}

func (a *app) startDiscovery(ctx context.Context) error {
	a.be = newBackendRegistry(a.cfg)
	a.be.onReady = func(c context.Context, running map[string]backend) {
		// running = Swarm tasks still up (may include draining / not /ready).
		a.place.reconcileStatuses(c, a.cfg, a.be.statusHTTP, running)
	}
	if _, err := eipnats.SubscribePlacementState(a.nats, a.place.applyState); err != nil {
		return a.fail(fmt.Errorf("nats subscribe placement state: %w", err))
	}
	lifecycle.GoCtx(ctx, a.be.pollLoop)
	return nil
}

func (a *app) startProbes(ctx context.Context) error {
	// Traefik + Swarm gate on this: router deps OK and ≥1 WS that passed orchestrationprobes /ready.
	ready := func(c context.Context) error {
		if a.nats == nil || !a.nats.Connected() {
			return fmt.Errorf("nats unavailable")
		}
		if a.be == nil || a.be.count() < 1 {
			return fmt.Errorf("no probe-ready websocket backends")
		}
		return nil
	}
	probes, err := orchestrationprobes.Start(ctx, ready, nil)
	if err != nil {
		return a.fail(err)
	}
	a.g.Add(probes)
	return nil
}

func (a *app) startHTTP(context.Context) error {
	srv := &Router{
		cfg:   a.cfg,
		be:    a.be,
		place: a.place,
	}

	if err := wsroutermetrics.Register(srv.snapshot); err != nil {
		return a.fail(err)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/", srv.handleProxy)

	httpRunner, err := lifecycle.HTTPServer("ws-router-http", &http.Server{
		Addr:              a.cfg.ListenAddr,
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
	})
	if err != nil {
		return a.fail(fmt.Errorf("http server: %w", err))
	}
	a.g.Add(httpRunner)
	return nil
}
