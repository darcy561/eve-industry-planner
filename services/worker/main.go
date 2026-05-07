package main

import (
	"context"
	"time"

	"eve-industry-planner/shared/core/authzhmac"
	mongoindex "eve-industry-planner/shared/core/mongo/indexing"
	natscore "eve-industry-planner/shared/core/nats"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/shared"
	"eve-industry-planner/shared/telemetry"
	asynqpkg "eve-industry-planner/worker/asynq"
	esiratelimiter "eve-industry-planner/worker/ratelimiter"

	"github.com/hibiken/asynq"
)

// WorkerDependencies holds all dependencies needed by worker subscribers
type WorkerDependencies struct {
	*shared.ServiceClients
	ESIClient   esiratelimiter.ClientInterface
	AsynqClient *asynq.Client // asynq client for all tasks
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

	teleShutdown, err := telemetry.Init(ctx, telemetry.DefaultConfig("worker"))
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
		logs.ErrorCtx(ctx, "authz hmac startup check failed", "err", err)
		shared.ShutdownOnError(ctx, cancel, clients, err, 5*time.Second)
		return
	}

	if err := mongoindex.EnsureIndexes(ctx, clients.Mongo); err != nil {
		logs.ErrorCtx(ctx, "mongo ensure indexes failed", "err", err)
		shared.ShutdownOnError(ctx, cancel, clients, err, 5*time.Second)
		return
	}

	// Ensure JetStream streams exist
	if err := natscore.EnsureWorkerTaskStream(clients.JetStream); err != nil {
		logs.ErrorCtx(ctx, "failed to ensure JetStream streams", "err", err)
		shared.ShutdownOnError(ctx, cancel, clients, err, 5*time.Second)
		return
	}

	// Initialize Redis-based ESI client with distributed rate limiting
	// This allows multiple worker containers to share the same rate limiter state
	defaultRateLimit := 3.0 // Default rate limit (req/s) for groups without specific configuration
	esiClient := esiratelimiter.NewRedisESIClient("https://esi.evetech.net", clients.Redis, defaultRateLimit)

	// Initialize rate limits for primary groups on startup
	// This overwrites any existing values, allowing configuration changes to take effect on restart
	rateLimits := map[string]float64{
		"market-order": defaultRateLimit, // Market order endpoints
		"industry":     defaultRateLimit, // Industry/system indexes
		"characters":   defaultRateLimit, // Corporation claims
		"status":       defaultRateLimit, // Status endpoints
	}
	if err := esiClient.InitializeDefaultRateLimits(ctx, rateLimits); err != nil {
		logs.ErrorCtx(ctx, "failed to initialize rate limits", "error", err)
		// Don't fail startup - rate limits will fall back to default
	} else {
		logs.InfoCtx(ctx, "rate limits initialized for primary groups", "rate_limits", rateLimits)
	}

	logs.InfoCtx(ctx, "Redis-based ESI rate-limited client initialized (distributed rate limiting enabled)")

	// Setup asynq for priority task processing
	// asynq's Concurrency setting IS the worker pool - no need for separate goroutine pool
	asynqClient, redisOpt, err := asynqpkg.SetupClient()
	if err != nil {
		logs.ErrorCtx(ctx, "failed to setup asynq client", "error", err)
		shared.ShutdownOnError(ctx, cancel, clients, err, 5*time.Second)
		return
	}
	clients.CleanupFns = append(clients.CleanupFns, func(c context.Context) {
		asynqClient.Close()
	})

	logs.InfoCtx(ctx, "worker service running")

	// Create worker dependencies (needed for asynq server setup)
	deps := &WorkerDependencies{
		ServiceClients: clients,
		ESIClient:      esiClient,
		AsynqClient:    asynqClient,
	}

	// Setup and start asynq server
	serverCleanup, err := asynqpkg.SetupServer(redisOpt, deps)
	if err != nil {
		logs.ErrorCtx(ctx, "failed to setup asynq server", "error", err)
		shared.ShutdownOnError(ctx, cancel, clients, err, 5*time.Second)
		return
	}
	clients.CleanupFns = append(clients.CleanupFns, serverCleanup)

	// Setup scheduled task subscribers
	// Task priority is determined by GetPriorityQueue() routing in asynq, not by subscription order
	scheduledTasksCleanup, err := SubscribeScheduledTasks(deps)
	if err != nil {
		logs.ErrorCtx(ctx, "failed to setup scheduled task subscribers", "error", err)
		shared.ShutdownOnError(ctx, cancel, clients, err, 5*time.Second)
		return
	}
	clients.CleanupFns = append(clients.CleanupFns, scheduledTasksCleanup)

	logs.InfoCtx(ctx, "message loops started successfully", "total_count", 5)

	// normal blocking shutdown
	shared.WaitForShutdown(ctx, 5*time.Second, clients.CleanupFns...)
}
