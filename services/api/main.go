package main

import (
	"context"
	"time"

	authzhmac "eve-industry-planner/shared/core/crypto/authzhmac/helper"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared"
	"eve-industry-planner/shared/telemetry"
	"eve-industry-planner/shared/telemetry/apimetrics"
)

func main() {
	// create signal-aware context first so we can cancel on startup failures
	ctx, cancel := shared.NewSignalContext(context.Background())

	teleShutdown, err := telemetry.Init(ctx, telemetry.DefaultConfig("api"))
	if err != nil {
		logs.ErrorCtx(ctx, "telemetry init failed", "err", err)
		cancel()
		return
	}

	// Connect to required services
	clients, err := shared.ConnectServices(ctx, shared.ServiceMongo, shared.ServiceNATS, shared.ServiceRedis)
	if err != nil {
		sctx, sdone := context.WithTimeout(context.Background(), 5*time.Second)
		_ = teleShutdown(sctx)
		sdone()
		shared.ShutdownOnError(ctx, cancel, clients, err, 5*time.Second)
		return
	}
	ts := teleShutdown
	clients.CleanupFns = append(clients.CleanupFns, func(c context.Context) { _ = ts(c) })

	if _, err := authzhmac.NewFromEnv(); err != nil {
		shared.ShutdownOnError(ctx, cancel, clients, err, 5*time.Second)
		return
	}

	apimetrics.RegisterSSORefreshDistinctGauges(clients.Redis)
	apimetrics.RegisterAuthSessionDistinctGauges(clients.Redis)

	// The doc-lock TTL expiry subscriber is a singleton workload — it runs
	// in the core service under a Redis lease so duplicate replicas don't
	// emit duplicate `document_lock_expired` events.

	logs.DebugCtx(ctx, "api service running")

	go func() {
		if err := StartAPIServer(ctx, clients); err != nil {
			logs.ErrorCtx(ctx, "failed to start api server", "err", err)
			shared.ShutdownOnError(ctx, cancel, clients, err, 5*time.Second)
			return
		}
	}()

	// normal blocking shutdown path
	shared.WaitForShutdown(ctx, 5*time.Second, clients.CleanupFns...)
}
