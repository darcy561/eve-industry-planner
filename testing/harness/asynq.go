package harness

import (
	"fmt"

	"eve-industry-planner/shared/core/config"

	"github.com/hibiken/asynq"
	"github.com/redis/go-redis/v9"
)

// CapacitySoakNoop is the Asynq task type capacity_soak enqueues while a queue is paused.
const CapacitySoakNoop = "capacitySoakNoop"

// AsynqRedisOpt builds asynq.RedisClientOpt from the product Redis URL SoT
// (REDIS_HOST / REDIS_PORT / REDIS_PASSWORD via config.RedisURL).
func AsynqRedisOpt() (asynq.RedisClientOpt, error) {
	u, err := config.RedisURL()
	if err != nil {
		return asynq.RedisClientOpt{}, err
	}
	opts, err := redis.ParseURL(u)
	if err != nil {
		return asynq.RedisClientOpt{}, fmt.Errorf("redis url: %w", err)
	}
	return asynq.RedisClientOpt{
		Addr:     opts.Addr,
		Username: opts.Username,
		Password: opts.Password,
		DB:       opts.DB,
	}, nil
}
