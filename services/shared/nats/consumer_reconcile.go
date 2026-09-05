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
// Durables this app owns that match neither rule are deleted; durables it does not
// own are never touched.
type StreamConsumerKeepPolicy struct {
	// KeepExact are durable names that must remain (this process's fan-out durables,
	// or shared names like task-worker).
	KeepExact []string
	// KeepPrefixes are the per-replica durable prefixes currently in use. A peer's
	// durable matches too; an abandoned one is reaped by InactiveThreshold rather
	// than by this pass.
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
	Skipped int // durables this app does not own
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

// consumerKeptByPolicy reports whether name is allowed by the keep policy.
func consumerKeptByPolicy(name string, policy StreamConsumerKeepPolicy) bool {
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

// ReconcileStreamConsumers deletes durables this app owns that the policy no
// longer covers, and stamps InactiveThreshold on the ones it keeps.
//
// Abandoned per-replica durables are left to InactiveThreshold: the server
// deletes one that stops pulling, which needs no guess about whether a quiet
// peer is dead. Listing is fully buffered before any delete so offset-based
// pagination cannot skip a consumer mid-pass.
func ReconcileStreamConsumers(ctx context.Context, stream jetstream.Stream, policy StreamConsumerKeepPolicy) (StreamConsumerReconcileResult, error) {
	var result StreamConsumerReconcileResult
	if stream == nil {
		return result, nil
	}
	exact := keepExactSet(policy.KeepExact)

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
		if info.Config.Metadata[MetadataOwnerKey] != MetadataOwnerValue {
			result.Skipped++
			continue
		}
		name := info.Name
		_, keptExact := exact[name]
		keptPrefix := consumerMatchesPrefix(name, policy.KeepPrefixes)
		if !keptExact && !keptPrefix {
			if err := DeleteConsumer(ctx, stream, name); err == nil {
				result.Deleted++
			}
			continue
		}

		applyThreshold := policy.InactiveThreshold > 0 && (keptPrefix || policy.ApplyThresholdToExact)
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

	if result.Deleted > 0 || result.Updated > 0 {
		logs.InfoCtx(ctx, "reconciled JetStream stream consumers",
			"listed", result.Listed,
			"skipped_not_owned", result.Skipped,
			"deleted", result.Deleted,
			"updated_inactive_threshold", result.Updated,
			"inactive_threshold", policy.InactiveThreshold.String())
	} else {
		logs.DebugCtx(ctx, "JetStream stream consumers already reconciled",
			"listed", result.Listed, "skipped_not_owned", result.Skipped)
	}
	return result, nil
}
