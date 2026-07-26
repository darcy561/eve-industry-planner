package cli

import (
	"encoding/json"
	"fmt"
	"net/url"
	"sort"
	"time"

	"eve-industry-planner/shared/core/config"

	"github.com/hibiken/asynq"
)

type asynqQueueInfo struct {
	Queue          string `json:"queue"`
	Paused         bool   `json:"paused"`
	Size           int    `json:"size"`
	Pending        int    `json:"pending"`
	Active         int    `json:"active"`
	Scheduled      int    `json:"scheduled"`
	Retry          int    `json:"retry"`
	Archived       int    `json:"archived"`
	Completed      int    `json:"completed"`
	Aggregating    int    `json:"aggregating"`
	ProcessedToday int    `json:"processed_today"`
	FailedToday    int    `json:"failed_today"`
	ProcessedTotal int    `json:"processed_total"`
	FailedTotal    int    `json:"failed_total"`
	Latency        string `json:"latency"`
	MemoryUsage    int64  `json:"memory_usage_bytes"`
}

// RunWorkerQueues prints current Asynq queue state for all known queues.
func RunWorkerQueues() error {
	redisOpt, err := asynqRedisOptFromConfig()
	if err != nil {
		return err
	}

	inspector := asynq.NewInspector(redisOpt)
	queueNames, err := inspector.Queues()
	if err != nil {
		return fmt.Errorf("failed listing asynq queues: %w", err)
	}
	sort.Strings(queueNames)

	queues := make([]asynqQueueInfo, 0, len(queueNames))
	for _, name := range queueNames {
		info, infoErr := inspector.GetQueueInfo(name)
		if infoErr != nil {
			return fmt.Errorf("failed reading queue info for %q: %w", name, infoErr)
		}
		queues = append(queues, asynqQueueInfo{
			Queue:          info.Queue,
			Paused:         info.Paused,
			Size:           info.Size,
			Pending:        info.Pending,
			Active:         info.Active,
			Scheduled:      info.Scheduled,
			Retry:          info.Retry,
			Archived:       info.Archived,
			Completed:      info.Completed,
			Aggregating:    info.Aggregating,
			ProcessedToday: info.Processed,
			FailedToday:    info.Failed,
			ProcessedTotal: info.ProcessedTotal,
			FailedTotal:    info.FailedTotal,
			Latency:        info.Latency.Round(time.Millisecond).String(),
			MemoryUsage:    info.MemoryUsage,
		})
	}

	out := map[string]interface{}{
		"retrieved_at": time.Now().UTC().Format(time.RFC3339),
		"queue_count":  len(queues),
		"queues":       queues,
	}
	b, err := json.MarshalIndent(out, "", "  ")
	if err != nil {
		return fmt.Errorf("failed formatting asynq queue info output: %w", err)
	}
	fmt.Println(string(b))
	return nil
}

func asynqRedisOptFromConfig() (asynq.RedisClientOpt, error) {
	rawURL, err := config.RedisURL()
	if err != nil {
		return asynq.RedisClientOpt{}, fmt.Errorf("failed loading redis config for asynq queue info: %w", err)
	}

	redisURL, err := url.Parse(rawURL)
	if err != nil {
		return asynq.RedisClientOpt{}, fmt.Errorf("failed parsing REDIS_URL for asynq queue info: %w", err)
	}

	password := ""
	if redisURL.User != nil {
		password, _ = redisURL.User.Password()
	}

	addr := redisURL.Host
	if addr == "" {
		addr = "redis:6379"
	}

	return asynq.RedisClientOpt{
		Addr:     addr,
		Password: password,
		DB:       0,
	}, nil
}
