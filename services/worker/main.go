package main

import (
	"context"
	"time"

	esiratelimiter "eve-industry-planner/shared/core/esi/rateLimiter"
	natscore "eve-industry-planner/shared/core/nats"
	"eve-industry-planner/shared/shared"
	"eve-industry-planner/shared/shared/logs"
	"eve-industry-planner/shared/shared/metrics"

	antslib "github.com/panjf2000/ants/v2"
)

// WorkerDependencies holds all dependencies needed by worker subscribers
type WorkerDependencies struct {
	*shared.ServiceClients
	Pool      *antslib.Pool
	ESIClient esiratelimiter.ClientInterface
}

func main() {
	// signal-aware context first
	ctx, cancel := shared.NewSignalContext(context.Background())

	// Connect to required services
	clients, err := shared.ConnectServices(ctx, shared.ServiceMongo, shared.ServiceNATS, shared.ServiceRedis)
	if err != nil {
		shared.ShutdownOnError(ctx, cancel, clients, err, 5*time.Second)
		return
	}

	// Ensure JetStream streams exist
	if err := natscore.EnsureWorkerTaskStream(clients.JetStream); err != nil {
		logs.Error("failed to ensure JetStream streams", "err", err)
		shared.ShutdownOnError(ctx, cancel, clients, err, 5*time.Second)
		return
	}

	// Initialize ESI client with rate limiting
	// Groups will be discovered dynamically from X-Ratelimit-Group headers
	esiClient := esiratelimiter.NewESIClient("https://esi.evetech.net", 3.0, 10)

	// Start background cleanup goroutine to remove unused groups
	// This prevents memory leaks from accumulating unused character-specific groups
	stopCleanup := esiClient.StartCleanupGoroutine()
	clients.CleanupFns = append(clients.CleanupFns, func(c context.Context) {
		stopCleanup()
	})

	logs.Debug("ESI rate-limited client initialized (dynamic group discovery enabled, cleanup goroutine started)")

	// Create goroutine pool for distributing tasks
	// Using blocking mode so tasks wait for pool availability
	poolSize := 10
	pool, err := antslib.NewPool(poolSize, antslib.WithNonblocking(false))
	if err != nil {
		logs.Error("failed to create goroutine pool", "error", err)
		shared.ShutdownOnError(ctx, cancel, clients, err, 5*time.Second)
		return
	}

	clients.CleanupFns = append(clients.CleanupFns, func(c context.Context) {
		// Release pool with 5 second timeout
		pool.ReleaseTimeout(5 * time.Second)
	})

	logs.Debug("goroutine pool created", "size", poolSize)

	logs.Info("worker service running")

	// Start metrics logger for Dozzle viewing (logs every 60 seconds)
	metrics.StartMetricsLogger(60 * time.Second)

	// Create worker dependencies
	deps := &WorkerDependencies{
		ServiceClients: clients,
		Pool:           pool,
		ESIClient:      esiClient,
	}

	// Setup all subscribers
	subscribers := []struct {
		name    string
		setupFn func(*WorkerDependencies) (func(context.Context), error)
	}{
		{"scheduledTasks", SubscribeScheduledTasks},
		{"authTasks", SubscribeAuthTasks},
	}

	// Initialize all subscribers on startup
	for _, sub := range subscribers {
		cleanup, err := sub.setupFn(deps)
		if err != nil {
			logs.Error("failed to setup subscriber", "subscriber", sub.name, "error", err)
			shared.ShutdownOnError(ctx, cancel, clients, err, 5*time.Second)
			return
		}
		clients.CleanupFns = append(clients.CleanupFns, cleanup)
	}

	// normal blocking shutdown
	shared.WaitForShutdown(ctx, 5*time.Second, clients.CleanupFns...)
}
