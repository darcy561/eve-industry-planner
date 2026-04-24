package nats

import (
	"context"
	"fmt"
	"time"

	"eve-industry-planner/shared/logs"

	"github.com/nats-io/nats.go/jetstream"
)

// subjectsAsSetEqual returns true when a and b contain the same subject tokens
// with the same multiplicities (order ignored). Used so we can prune obsolete
// JetStream bindings when code drops a pattern (e.g. removed doc.subscribe.>).
func subjectsAsSetEqual(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	counts := make(map[string]int, len(a))
	for _, s := range a {
		counts[s]++
	}
	for _, s := range b {
		counts[s]--
		if counts[s] < 0 {
			return false
		}
	}
	for _, n := range counts {
		if n != 0 {
			return false
		}
	}
	return true
}

// EnsureStreams creates JetStream streams for the given subjects if they don't exist,
// or reconciles existing streams so their Subjects match the configured slice exactly
// (adds missing patterns and prunes obsolete ones no longer listed in code).
func EnsureStreams(js jetstream.JetStream, streams []StreamConfig) error {
	ctx := context.Background()
	for _, streamConfig := range streams {
		stream, err := js.Stream(ctx, streamConfig.Name)
		if err == nil && stream != nil {
			info := stream.CachedInfo()
			if info == nil {
				continue
			}

			existing := info.Config.Subjects
			desired := streamConfig.Subjects
			if subjectsAsSetEqual(existing, desired) {
				logs.DebugCtx(ctx, "JetStream stream subjects already match config", "name", streamConfig.Name)
				continue
			}

			// Preserve stream limits/placement/etc.; only swap subject bindings (and MaxAge when set).
			updateCfg := info.Config
			updateCfg.Subjects = append([]string(nil), desired...)
			if streamConfig.MaxAge > 0 {
				updateCfg.MaxAge = streamConfig.MaxAge
			}

			_, err = js.UpdateStream(ctx, updateCfg)
			if err != nil {
				logs.WarnCtx(ctx, "failed to reconcile JetStream stream subjects (prune or add failed); stale consumers may block subject removal — delete obsolete durables if needed",
					"stream", streamConfig.Name, "from", existing, "to", desired, "error", err)
				continue
			}
			logs.InfoCtx(ctx, "reconciled JetStream stream subjects to match code config",
				"name", streamConfig.Name, "from", existing, "to", desired)
			continue
		}

		// Stream doesn't exist, create it
		cfg := jetstream.StreamConfig{
			Name:      streamConfig.Name,
			Subjects:  streamConfig.Subjects,
			Retention: jetstream.LimitsPolicy,
			Storage:   jetstream.FileStorage,
			MaxAge:    streamConfig.MaxAge,
		}

		_, err = js.CreateStream(ctx, cfg)
		if err != nil {
			return fmt.Errorf("failed to create stream %s: %w", streamConfig.Name, err)
		}
		logs.InfoCtx(ctx, "created JetStream stream", "name", streamConfig.Name, "subjects", streamConfig.Subjects)
	}
	return nil
}

// StreamConfig represents configuration for a JetStream stream
type StreamConfig struct {
	Name     string
	Subjects []string
	MaxAge   time.Duration
}

// EnsureWorkerTaskStream ensures the worker task stream exists with its configured subjects.
// This is a convenience function that automatically uses WorkerTaskStreamSubjects.
// The stream accepts all subjects matching "task.>" - consumers filter to specific patterns.
func EnsureWorkerTaskStream(js jetstream.JetStream) error {
	streamConfigs := []StreamConfig{
		{
			Name:     WorkerTaskStream,
			Subjects: WorkerTaskStreamSubjects,
			MaxAge:   24 * time.Hour,
		},
	}
	return EnsureStreams(js, streamConfigs)
}

// EnsureSchedulerStream ensures the scheduler stream exists with its configured subjects.
// This is a convenience function that automatically uses SchedulerStreamSubjects.
// The stream accepts all subjects matching "scheduler.>" - consumers filter to specific patterns.
func EnsureSchedulerStream(js jetstream.JetStream) error {
	streamConfigs := []StreamConfig{
		{
			Name:     SchedulerStream,
			Subjects: SchedulerStreamSubjects,
			MaxAge:   24 * time.Hour,
		},
	}
	return EnsureStreams(js, streamConfigs)
}

// EnsureDocUpdateStream ensures the document update stream exists with its configured subjects.
// This is a convenience function that automatically uses DocUpdateStreamSubjects.
func EnsureDocUpdateStream(js jetstream.JetStream) error {
	streamConfigs := []StreamConfig{
		{
			Name:     DocUpdateStream,
			Subjects: DocUpdateStreamSubjects,
			MaxAge:   1 * time.Hour, // Document updates don't need long retention
		},
	}
	return EnsureStreams(js, streamConfigs)
}

// GetOrEnsureStream ensures a stream exists using the provided ensure function, then retrieves and returns it.
// This is a convenience function that combines stream creation and retrieval.
func GetOrEnsureStream(ctx context.Context, js jetstream.JetStream, ensureFunc func(jetstream.JetStream) error, streamName string) (jetstream.Stream, error) {
	// Ensure the stream exists
	if err := ensureFunc(js); err != nil {
		return nil, fmt.Errorf("failed to ensure stream %s: %w", streamName, err)
	}

	// Get the stream
	stream, err := js.Stream(ctx, streamName)
	if err != nil {
		return nil, fmt.Errorf("failed to get stream %s: %w", streamName, err)
	}

	return stream, nil
}

// GetOrCreateConsumer gets an existing consumer or creates a new one with the specified config.
// If a consumer exists with a different DeliverPolicy or FilterSubject, it will be deleted and recreated
// since these are immutable on existing consumers.
func GetOrCreateConsumer(ctx context.Context, stream jetstream.Stream, consumerConfig jetstream.ConsumerConfig) (jetstream.Consumer, error) {
	// Try to get existing consumer
	existingConsumer, err := stream.Consumer(ctx, consumerConfig.Durable)
	if err == nil {
		// Consumer exists, check if immutable config matches
		info := existingConsumer.CachedInfo()
		if info == nil {
			// Can't check config, delete and recreate
			if err := stream.DeleteConsumer(ctx, consumerConfig.Durable); err != nil {
				logs.WarnCtx(ctx, "failed to delete existing consumer", "consumer", consumerConfig.Durable, "error", err)
			}
		} else {
			needsRecreate := false
			// Check DeliverPolicy (immutable)
			if info.Config.DeliverPolicy != consumerConfig.DeliverPolicy {
				logs.InfoCtx(ctx, "consumer DeliverPolicy mismatch, will recreate", "consumer", consumerConfig.Durable, "existing", info.Config.DeliverPolicy, "requested", consumerConfig.DeliverPolicy)
				needsRecreate = true
			}
			// Check FilterSubject (immutable)
			if info.Config.FilterSubject != consumerConfig.FilterSubject {
				logs.InfoCtx(ctx, "consumer FilterSubject mismatch, will recreate", "consumer", consumerConfig.Durable, "existing", info.Config.FilterSubject, "requested", consumerConfig.FilterSubject)
				needsRecreate = true
			}
			if needsRecreate {
				// Delete the existing consumer to recreate with correct config
				if err := stream.DeleteConsumer(ctx, consumerConfig.Durable); err != nil {
					logs.WarnCtx(ctx, "failed to delete existing consumer with different config", "consumer", consumerConfig.Durable, "error", err)
				}
			} else {
				// Consumer exists with correct config, use it
				return existingConsumer, nil
			}
		}
	}

	// Create new consumer
	consumer, err := stream.CreateConsumer(ctx, consumerConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to create consumer %s: %w", consumerConfig.Durable, err)
	}

	return consumer, nil
}
