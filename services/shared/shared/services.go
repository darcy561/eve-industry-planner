package shared

import (
	"context"
	"fmt"
	"time"

	"eve-industry-planner/shared/core/mongo"
	"eve-industry-planner/shared/core/nats"
	"eve-industry-planner/shared/core/redis"
	"eve-industry-planner/shared/shared/logs"

	natslib "github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"
	redislib "github.com/redis/go-redis/v9"
	mongodriver "go.mongodb.org/mongo-driver/mongo"
)

// ServiceName constants for specifying which services to connect
const (
	ServiceMongo = "mongo"
	ServiceNATS  = "nats"
	ServiceRedis = "redis"
)

// ServiceClients holds all the connected service clients
type ServiceClients struct {
	Mongo      *mongodriver.Client
	NATS       *natslib.Conn
	JetStream  jetstream.JetStream
	Redis      *redislib.Client
	CleanupFns []func(context.Context)
}

// ConnectServices connects to the services specified as variadic parameters and sets up cleanup functions.
// Only specify the services you need, e.g., ConnectServices(ctx, ServiceMongo, ServiceNATS)
// Returns the clients and cleanup functions, or an error if any connection fails.
// Cleanup functions are automatically appended in order as services are successfully connected.
func ConnectServices(ctx context.Context, services ...string) (*ServiceClients, error) {
	clients := &ServiceClients{
		CleanupFns: []func(context.Context){},
	}

	// Build a map of requested services for quick lookup
	requested := make(map[string]bool)
	for _, service := range services {
		requested[service] = true
	}

	// Connect to MongoDB if requested
	if requested[ServiceMongo] {
		mongoClient, err := mongo.ConnectPrimary()
		if err != nil {
			// Check if error is from config loading (missing env vars)
			if configErr, ok := err.(interface{ Error() string }); ok {
				return nil, fmt.Errorf("configuration error: %w", configErr)
			}
			return nil, fmt.Errorf("failed to connect to mongo: %w", err)
		}
		clients.Mongo = mongoClient
		clients.CleanupFns = append(clients.CleanupFns, func(c context.Context) { mongo.Cleanup(c, mongoClient) })
	}

	// Connect to NATS/JetStream if requested
	if requested[ServiceNATS] {
		natsConn, jsContext, err := nats.ConnectJetStream()
		if err != nil {
			return nil, fmt.Errorf("failed to connect to nats: %w", err)
		}
		clients.NATS = natsConn
		clients.JetStream = jsContext
		clients.CleanupFns = append(clients.CleanupFns, func(c context.Context) { nats.Cleanup(natsConn) })
	}

	// Connect to Redis if requested
	if requested[ServiceRedis] {
		redisClient, err := redis.Connect()
		if err != nil {
			return nil, fmt.Errorf("failed to connect to redis: %w", err)
		}
		clients.Redis = redisClient
		clients.CleanupFns = append(clients.CleanupFns, func(c context.Context) { redis.Cleanup(c, redisClient) })
	}

	return clients, nil
}

// ShutdownOnError handles cleanup and shutdown when an error occurs during initialization.
// This ensures all successfully connected services are properly cleaned up.
func ShutdownOnError(ctx context.Context, cancel context.CancelFunc, clients *ServiceClients, err error, timeout time.Duration) {
	if clients != nil {
		logs.Error("initialization failed", "error", err)
		cancel()
		WaitForShutdown(ctx, timeout, clients.CleanupFns...)
	} else {
		logs.Error("initialization failed", "error", err)
		cancel()
		WaitForShutdown(ctx, timeout)
	}
}
