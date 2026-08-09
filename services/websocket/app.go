package main

import (
	"context"
	"eve-industry-planner/shared/stackservices"
	"fmt"
	"net/http"
	"os"

	"eve-industry-planner/api/middleware"
	"eve-industry-planner/shared/container"
	"eve-industry-planner/shared/core/config"
	natscore "eve-industry-planner/shared/core/nats"
	"eve-industry-planner/shared/lifecycle"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/orchestrationprobes"
	"eve-industry-planner/shared/telemetry"
	"eve-industry-planner/shared/wsplacement"
	wsserver "eve-industry-planner/websocket/server"
)

// Per-cleanup budget matches stack x-app-stop-grace (lifecycle.AppStopGrace).
const shutdownTimeout = lifecycle.AppStopGrace

type app struct {
	g        lifecycle.Group
	stopDeps func(context.Context)
	clients  *stackservices.Clients
	ws       *wsserver.Server
	initErr  error
}

func (a *app) cleanups() []func(context.Context) {
	// DrainForRoll (publish draining, delete durables, stop intake, flush outbound,
	// kick) then Shutdown (sync pool; durable delete idempotent) share one cleanup
	// budget (60s) before HTTP/probes/deps stop.
	var appLayer []func(context.Context)
	if a.ws != nil {
		appLayer = append(appLayer, func(c context.Context) {
			a.ws.DrainForRoll(c)
			a.ws.Shutdown(c)
		})
	}
	appLayer = append(appLayer, a.g.Cleanups()...)
	return lifecycle.AppThenDeps(appLayer, a.stopDeps)
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
	teleShutdown, err := telemetry.Init(ctx, telemetry.DefaultConfig("websocket"))
	if err != nil {
		return a.fail(err)
	}
	a.g.AddApp(func(c context.Context) { _ = teleShutdown(c) })

	logs.SetDebugIdentityResolver(func(c context.Context) (string, string) {
		return logs.RequestAccountIDFromContext(c), logs.RequestSessionIDFromContext(c)
	})

	clients, stopDeps, err := stackservices.Connect(ctx, stackservices.Services{
		Mongo: true, NATS: true, Redis: true,
	})
	if err != nil {
		return a.fail(err)
	}
	a.clients = clients
	a.stopDeps = stopDeps
	return nil
}

func (a *app) startServer(ctx context.Context) error {
	a.ws = wsserver.NewServer(a.clients)

	// Do not wrap with otelhttp: gorilla/websocket Upgrade requires Hijacker.
	core := http.HandlerFunc(a.ws.HandleWS)
	h := middleware.RequestStartTimeConstructor()(
		middleware.RequestLoggingConstructor()(core),
	)

	mux := http.NewServeMux()
	mux.Handle("/ws", h)
	mux.Handle("/ws/", h)
	mux.HandleFunc(wsplacement.StatusPath, a.ws.HandlePlacement)

	addr := ":" + config.WSPort()
	logs.InfoCtx(ctx, "ws server starting", "addr", addr)
	runner, err := lifecycle.HTTPServer("websocket-http", &http.Server{Addr: addr, Handler: mux})
	if err != nil {
		return a.fail(err)
	}
	a.g.Add(runner)
	return nil
}

func (a *app) startProbes(ctx context.Context) error {
	// Server starts first so Ready can observe draining.
	ready := func(c context.Context) error {
		if a.ws != nil && a.ws.IsDraining() {
			return fmt.Errorf("draining")
		}
		if err := a.clients.Redis.Ping(c).Err(); err != nil {
			return fmt.Errorf("redis: %w", err)
		}
		if a.clients.NATS == nil || !a.clients.NATS.IsConnected() {
			return fmt.Errorf("nats not connected")
		}
		if err := a.clients.Mongo.Ping(c); err != nil {
			return fmt.Errorf("mongo: %w", err)
		}
		return nil
	}
	probes, err := orchestrationprobes.Start(ctx, ready, nil)
	if err != nil {
		return a.fail(err)
	}
	a.g.Add(probes)

	bus, err := orchestrationprobes.StartBus(ctx, orchestrationprobes.BusOptions{
		Role:       "websocket",
		InstanceID: container.ID(),
		Conn:       a.clients.NATS,
		Ready:      ready,
		Enabled:    true,
		Fill: func(st *natscore.HealthStatus) {
			if st == nil {
				return
			}
			st.AppVersion = os.Getenv("APP_VERSION")
			if a.ws == nil {
				return
			}
			ps := a.ws.CurrentPlacementSnapshot()
			st.Clients = ps.Clients
			st.Soft = ps.Soft
			st.Full = ps.Full
			st.Draining = ps.Draining
			st.HostedTenantCount = len(a.ws.HostedTenants())
		},
	})
	if err != nil {
		return a.fail(err)
	}
	a.g.Add(bus)

	cmdBus, err := a.ws.StartWSCommandBus(ctx, a.clients.NATS)
	if err != nil {
		return a.fail(err)
	}
	a.g.Add(cmdBus)
	return nil
}
