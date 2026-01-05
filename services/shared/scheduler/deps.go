package scheduler

import (
	"log/slog"

	natslib "github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"
	redislib "github.com/redis/go-redis/v9"
	"github.com/robfig/cron/v3"
	mongodriver "go.mongodb.org/mongo-driver/mongo"
)

// Dependencies contains all possible dependencies for schedulers
type Dependencies struct {
	Cron      *cron.Cron
	NATS      *natslib.Conn
	JSContext jetstream.JetStream
	Redis     *redislib.Client
	Mongo     *mongodriver.Client
	Log       *slog.Logger
	// Add other dependencies here as needed (e.g., HTTP client, config, etc.)
}
