package main

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"eve-industry-planner/shared/lifecycle"
	"eve-industry-planner/shared/orchestrationprobes"

	"github.com/redis/go-redis/v9"
)

const shutdownTimeout = 15 * time.Second

type app struct {
	g        lifecycle.Group
	stopDeps func(context.Context)
	cfg      config
	rdb      *redis.Client
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

func (a *app) connectDeps(context.Context) error {
	a.cfg = loadConfig()
	a.rdb = newRedis(a.cfg)
	a.stopDeps = func(context.Context) { _ = a.rdb.Close() }
	return nil
}

func (a *app) startDiscovery(ctx context.Context) error {
	a.be = newBackendRegistry(a.cfg)
	lifecycle.GoCtx(ctx, a.be.pollLoop)
	return nil
}

func (a *app) startProbes(ctx context.Context) error {
	// Traefik + Swarm gate on this: router deps OK and ≥1 WS that passed orchestrationprobes /ready.
	ready := func(c context.Context) error {
		if a.rdb.Ping(c).Err() != nil {
			return fmt.Errorf("redis unavailable")
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
		cfg: a.cfg,
		rdb: a.rdb,
		be:  a.be,
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/metrics", srv.handleMetrics)
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
