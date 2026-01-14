package main

import (
	"context"
	"time"

	natscore "eve-industry-planner/shared/core/nats"
	"eve-industry-planner/shared/shared"
	"eve-industry-planner/shared/shared/logs"
	"eve-industry-planner/shared/shared/metrics"
	asynqpkg "eve-industry-planner/worker/asynq"
	esiratelimiter "eve-industry-planner/worker/ratelimiter"

	"github.com/hibiken/asynq"
)

// WorkerDependencies holds all dependencies needed by worker subscribers
type WorkerDependencies struct {
	*shared.ServiceClients
	ESIClient      esiratelimiter.ClientInterface
	ESIAsynqClient *asynq.Client // asynq client for ESI tasks
	RegularClient  *asynq.Client // asynq client for regular tasks
}

// GetServiceClients implements asynqpkg.WorkerDependencies interface
func (d *WorkerDependencies) GetServiceClients() *shared.ServiceClients {
	return d.ServiceClients
}

// GetESIClient implements asynqpkg.WorkerDependencies interface
func (d *WorkerDependencies) GetESIClient() esiratelimiter.ClientInterface {
	return d.ESIClient
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

	// Setup asynq for strict priority task processing
	// asynq's Concurrency setting IS the worker pool - no need for separate goroutine pool
	asynqClients, redisOpt, err := asynqpkg.SetupClients()
	if err != nil {
		logs.Error("failed to setup asynq clients", "error", err)
		shared.ShutdownOnError(ctx, cancel, clients, err, 5*time.Second)
		return
	}
	clients.CleanupFns = append(clients.CleanupFns, func(c context.Context) {
		asynqClients.ESI.Close()
		asynqClients.Regular.Close()
	})

	logs.Info("worker service running")

	// Start metrics logger for Dozzle viewing (logs every 60 seconds)
	metrics.StartMetricsLogger(60 * time.Second)

	// Create worker dependencies (needed for asynq server setup)
	deps := &WorkerDependencies{
		ServiceClients: clients,
		ESIClient:      esiClient,
		ESIAsynqClient: asynqClients.ESI,
		RegularClient:  asynqClients.Regular,
	}

	// Setup and start both asynq servers
	esiCleanup, regularCleanup, err := asynqpkg.SetupServers(redisOpt, deps)
	if err != nil {
		logs.Error("failed to setup asynq servers", "error", err)
		shared.ShutdownOnError(ctx, cancel, clients, err, 5*time.Second)
		return
	}
	clients.CleanupFns = append(clients.CleanupFns, esiCleanup, regularCleanup)

	// Setup all subscribers
	// Priority order: High -> Regular -> Low
	// Higher priority tasks are set up first so they're processed before lower priority tasks
	subscribers := []struct {
		name    string
		setupFn func(*WorkerDependencies) (func(context.Context), error)
		count   int // Expected number of message loops this subscriber will start
	}{
		{"scheduledTasksHighPriority", SubscribeScheduledTasksHighPriority, 1},
		{"scheduledTasksRegularPriority", SubscribeScheduledTasksRegularPriority, 3}, // System indexes, adjusted prices, missing market prices
		{"scheduledTasksLowPriority", SubscribeScheduledTasksLowPriority, 1},
	}

	// Initialize all subscribers on startup
	var totalStarted int
	for _, sub := range subscribers {
		cleanup, err := sub.setupFn(deps)
		if err != nil {
			logs.Error("failed to setup subscriber", "subscriber", sub.name, "error", err)
			shared.ShutdownOnError(ctx, cancel, clients, err, 5*time.Second)
			return
		}
		clients.CleanupFns = append(clients.CleanupFns, cleanup)
		totalStarted += sub.count
	}

	// Log summary of subscriber setup (only reached if all subscribers succeed)
	logs.Info("ESI message loops started successfully", "total_count", totalStarted)

	// normal blocking shutdown
	shared.WaitForShutdown(ctx, 5*time.Second, clients.CleanupFns...)
}
