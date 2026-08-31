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
// DeliverPolicy mismatch still forces delete+recreate.
//
// When the requested config sets FilterSubjects (plural), filters are treated as mutable:
// drift is reconciled with UpdateConsumer and does not recreate the durable. Worker/scheduler
// callers that use singular FilterSubject keep recreate-on-mismatch for that field.
// InactiveThreshold is always reconciled via UpdateConsumer when the durable already exists.
func GetOrCreateConsumer(ctx context.Context, stream jetstream.Stream, consumerConfig jetstream.ConsumerConfig) (jetstream.Consumer, error) {
	mutableFilters := len(consumerConfig.FilterSubjects) > 0

	// Try to get existing consumer
	existingConsumer, err := stream.Consumer(ctx, consumerConfig.Durable)
	if err == nil {
		// Consumer exists, check if immutable config matches
		info := existingConsumer.CachedInfo()
		if info == nil {
			// Can't check config, delete and recreate
			_ = DeleteConsumer(ctx, stream, consumerConfig.Durable)
		} else {
			needsRecreate := false
			if info.Config.DeliverPolicy != consumerConfig.DeliverPolicy {
				logs.InfoCtx(ctx, "consumer DeliverPolicy mismatch, will recreate", "consumer", consumerConfig.Durable, "existing", info.Config.DeliverPolicy, "requested", consumerConfig.DeliverPolicy)
				needsRecreate = true
			}
			if !mutableFilters {
				// Static singular filter (worker/scheduler): mismatch → recreate.
				if info.Config.FilterSubject != consumerConfig.FilterSubject {
					logs.InfoCtx(ctx, "consumer FilterSubject mismatch, will recreate", "consumer", consumerConfig.Durable, "existing", info.Config.FilterSubject, "requested", consumerConfig.FilterSubject)
					needsRecreate = true
				}
			}
			if needsRecreate {
				_ = DeleteConsumer(ctx, stream, consumerConfig.Durable)
			} else {
				updateCfg := info.Config
				changed := false
				if mutableFilters {
					desired := NormalizeFilterSubjects(consumerConfig.FilterSubjects)
					current := ConsumerFilterSubjects(info.Config)
					if !subjectsAsSetEqual(current, desired) {
						updateCfg.FilterSubject = ""
						updateCfg.FilterSubjects = append([]string(nil), desired...)
						changed = true
					}
				}
				if info.Config.InactiveThreshold != consumerConfig.InactiveThreshold {
					updateCfg.InactiveThreshold = consumerConfig.InactiveThreshold
					changed = true
				}
				if changed {
					updated, uerr := stream.UpdateConsumer(ctx, updateCfg)
					if uerr != nil {
						logs.WarnCtx(ctx, "failed to reconcile consumer config", "consumer", consumerConfig.Durable, "error", uerr)
						return existingConsumer, nil
					}
					logs.InfoCtx(ctx, "reconciled consumer config",
						"consumer", consumerConfig.Durable,
						"mutable_filters", mutableFilters)
					return updated, nil
				}
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
