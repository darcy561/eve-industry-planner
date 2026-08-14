package nats

import (
	"context"
	"errors"
	"strings"
	"time"

	"eve-industry-planner/shared/logs"

	"github.com/nats-io/nats.go/jetstream"
)

// StreamConsumerKeepPolicy describes which durables on a stream are still intentional.
// Anything else is deleted. Prefer this over maintaining legacy-name delete lists.
type StreamConsumerKeepPolicy struct {
	// KeepExact are durable names that must remain (this process's fan-out durables,
	// or shared names like task-worker).
	KeepExact []string
	// KeepPrefixes are per-replica durable prefixes. Matching names with waiting pulls
	// are retained (live peers); matching names with 0 waiters are deleted as orphans.
	// InactiveThreshold is stamped onto kept prefix matches.
	KeepPrefixes []string
	// InactiveThreshold, when > 0, is stamped onto kept prefix-matching durables
	// (and onto KeepExact when ApplyThresholdToExact is true).
	InactiveThreshold time.Duration
	// ApplyThresholdToExact also stamps InactiveThreshold onto KeepExact durables.
	ApplyThresholdToExact bool
}

// StreamConsumerReconcileResult summarizes allowlist-based consumer hygiene.
type StreamConsumerReconcileResult struct {
	Listed  int
	Deleted int
	Updated int
}

func keepExactSet(names []string) map[string]struct{} {
	if len(names) == 0 {
		return nil
	}
	out := make(map[string]struct{}, len(names))
	for _, n := range names {
		if n != "" {
			out[n] = struct{}{}
		}
	}
	return out
}

// ConsumerKeptByPolicy reports whether name is allowed by the keep policy's static
// allowlist (exact name or prefix). Runtime orphan detection (0 waiting pulls) is
// applied separately in ReconcileStreamConsumers.
func ConsumerKeptByPolicy(name string, policy StreamConsumerKeepPolicy) bool {
	if _, ok := keepExactSet(policy.KeepExact)[name]; ok {
		return true
	}
	return consumerMatchesPrefix(name, policy.KeepPrefixes)
}

func consumerMatchesPrefix(name string, prefixes []string) bool {
	for _, prefix := range prefixes {
		if prefix != "" && strings.HasPrefix(name, prefix) {
			return true
		}
	}
	return false
}

func isConsumerNotFound(err error) bool {
	return err != nil && errors.Is(err, jetstream.ErrConsumerNotFound)
}

// DeleteConsumer removes a durable consumer from stream.
// ErrConsumerNotFound is success (already gone / peer race). Other errors are
// logged and returned. Nil stream or empty name is a no-op.
func DeleteConsumer(ctx context.Context, stream jetstream.Stream, name string) error {
	if stream == nil || name == "" {
		return nil
	}
	if err := stream.DeleteConsumer(ctx, name); err != nil {
		if isConsumerNotFound(err) {
			return nil
		}
		logs.WarnCtx(ctx, "failed to delete stream consumer", "consumer", name, "error", err)
		return err
	}
	return nil
}

// DeleteConsumers removes each named durable. Continues after errors.
// Returns how many names completed successfully (including already-absent).
func DeleteConsumers(ctx context.Context, stream jetstream.Stream, names ...string) (ok int) {
	for _, name := range names {
		if name == "" {
			continue
		}
		if err := DeleteConsumer(ctx, stream, name); err == nil {
			ok++
		}
	}
	return ok
}

// ReconcileStreamConsumers deletes durables not covered by policy and optionally
// reconciles InactiveThreshold on kept durables. Listing is fully buffered before
// any deletes so offset-based JetStream pagination cannot skip consumers mid-pass.
// Multiple passes cover concurrent peer deletes.
func ReconcileStreamConsumers(ctx context.Context, stream jetstream.Stream, policy StreamConsumerKeepPolicy) (StreamConsumerReconcileResult, error) {
	var result StreamConsumerReconcileResult
	if stream == nil {
		return result, nil
	}

	const maxPasses = 8
	for range maxPasses {
		passResult, err := reconcileStreamConsumersOnce(ctx, stream, policy)
		result.Listed = passResult.Listed
		result.Deleted += passResult.Deleted
		result.Updated += passResult.Updated
		if err != nil {
			return result, err
		}
		if passResult.Deleted == 0 {
			break
		}
	}

	if result.Deleted > 0 || result.Updated > 0 {
		logs.InfoCtx(ctx, "reconciled JetStream stream consumers",
			"listed", result.Listed,
			"deleted", result.Deleted,
			"updated_inactive_threshold", result.Updated,
			"inactive_threshold", policy.InactiveThreshold.String())
	} else {
		logs.DebugCtx(ctx, "JetStream stream consumers already reconciled",
			"listed", result.Listed)
	}
	return result, nil
}

func reconcileStreamConsumersOnce(ctx context.Context, stream jetstream.Stream, policy StreamConsumerKeepPolicy) (StreamConsumerReconcileResult, error) {
	var result StreamConsumerReconcileResult
	exact := keepExactSet(policy.KeepExact)

	// Buffer the full consumer list before mutating — deleting while walking
	// JetStream's offset pages skips remaining durables.
	lister := stream.ListConsumers(ctx)
	var infos []*jetstream.ConsumerInfo
	for info := range lister.Info() {
		infos = append(infos, info)
	}
	if err := lister.Err(); err != nil {
		return result, err
	}
	result.Listed = len(infos)

	for _, info := range infos {
		name := info.Name
		_, keptExact := exact[name]
		keptPrefix := consumerMatchesPrefix(name, policy.KeepPrefixes)

		switch {
		case keptExact:
			// Always keep this process's durables.
		case keptPrefix:
			// Same naming generation: drop abandoned replicas (no waiters).
			// Callers should run this after pull loops are up so peers show NumWaiting > 0.
			if info.NumWaiting == 0 {
				if err := DeleteConsumer(ctx, stream, name); err == nil {
					result.Deleted++
				}
				continue
			}
		default:
			if err := DeleteConsumer(ctx, stream, name); err == nil {
				result.Deleted++
			}
			continue
		}

		applyThreshold := false
		if policy.InactiveThreshold > 0 {
			if keptPrefix {
				applyThreshold = true
			} else if keptExact && policy.ApplyThresholdToExact {
				applyThreshold = true
			}
		}
		if !applyThreshold || info.Config.InactiveThreshold == policy.InactiveThreshold {
			continue
		}
		updateCfg := info.Config
		updateCfg.InactiveThreshold = policy.InactiveThreshold
		if _, err := stream.UpdateConsumer(ctx, updateCfg); err != nil {
			logs.WarnCtx(ctx, "failed to set InactiveThreshold on stream consumer", "consumer", name, "error", err)
			continue
		}
		result.Updated++
	}
	return result, nil
}

// DocUpdateFanoutKeepPolicy is the allowlist for doc-update-stream websocket durables.
// keepExact should be this replica's current durable names so they are never treated as orphans.
func DocUpdateFanoutKeepPolicy(inactiveThreshold time.Duration, keepExact ...string) StreamConsumerKeepPolicy {
	if inactiveThreshold <= 0 {
		inactiveThreshold = time.Hour
	}
	return StreamConsumerKeepPolicy{
		KeepExact: keepExact,
		KeepPrefixes: []string{
			DurablePrefixDocLiveUpdates,
			DurablePrefixDocLock,
		},
		InactiveThreshold:     inactiveThreshold,
		ApplyThresholdToExact: true,
	}
}

// WorkerTaskKeepPolicy is the allowlist for worker-task-stream (single shared durable).
func WorkerTaskKeepPolicy() StreamConsumerKeepPolicy {
	return StreamConsumerKeepPolicy{
		KeepExact: []string{ConsumerTaskWorker},
	}
}

// SchedulerKeepPolicy is the allowlist for scheduler-stream (single shared durable).
func SchedulerKeepPolicy() StreamConsumerKeepPolicy {
	return StreamConsumerKeepPolicy{
		KeepExact: []string{ConsumerScheduler},
	}
}
