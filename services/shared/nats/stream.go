package nats

import (
	"context"
	"fmt"
	"maps"
	"sync"

	"eve-industry-planner/shared/logs"

	"github.com/nats-io/nats.go/jetstream"
)

// Stream is a spec bound to a JetStream context. Binding costs nothing; the
// server is not touched until [Stream.Ensure].
type Stream struct {
	spec StreamSpec
	js   jetstream.JetStream

	mu    sync.Mutex
	bound jetstream.Stream
}

func newStream(spec StreamSpec, js jetstream.JetStream) *Stream {
	return &Stream{spec: spec, js: js}
}

// Spec returns the declaration this stream was bound from.
func (s *Stream) Spec() StreamSpec { return s.spec }

// Ensure creates or updates the stream to match its spec and returns it. The
// result is cached, so repeated calls cost one round trip.
func (s *Stream) Ensure(ctx context.Context) (jetstream.Stream, error) {
	if s == nil || s.js == nil {
		return nil, fmt.Errorf("stream is not bound to a jetstream context")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.bound != nil {
		return s.bound, nil
	}

	stream, err := s.js.CreateOrUpdateStream(ctx, jetstream.StreamConfig{
		Name:              s.spec.Name,
		Subjects:          append([]string(nil), s.spec.Subjects...),
		Retention:         jetstream.LimitsPolicy,
		Storage:           jetstream.FileStorage,
		MaxAge:            s.spec.MaxAge,
		AllowMsgSchedules: s.spec.Schedules,
		Metadata:          map[string]string{MetadataOwnerKey: MetadataOwnerValue},
	})
	if err != nil {
		return nil, fmt.Errorf("ensure stream %s: %w", s.spec.Name, err)
	}
	s.bound = stream
	return stream, nil
}

// Consumer creates or updates a durable on the stream, stamping ownership so
// reconcile can tell this app's durables from anything else on the server.
//
// DeliverPolicy is immutable once a consumer exists — the server rejects an
// update with "deliver policy can not be updated" — so a change to it is applied
// by deleting the durable and creating it again. Everything else updates in
// place.
func (s *Stream) Consumer(ctx context.Context, cfg jetstream.ConsumerConfig) (jetstream.Consumer, error) {
	stream, err := s.Ensure(ctx)
	if err != nil {
		return nil, err
	}
	if cfg.Durable == "" {
		return nil, fmt.Errorf("durable name is required")
	}
	cfg.Metadata = withOwnerMetadata(cfg.Metadata)

	existing, err := stream.Consumer(ctx, cfg.Durable)
	if err == nil && existing != nil {
		if info := existing.CachedInfo(); info != nil && info.Config.DeliverPolicy != cfg.DeliverPolicy {
			logs.InfoCtx(ctx, "consumer DeliverPolicy changed, recreating",
				"consumer", cfg.Durable,
				"from", info.Config.DeliverPolicy,
				"to", cfg.DeliverPolicy)
			if delErr := DeleteConsumer(ctx, stream, cfg.Durable); delErr != nil {
				return nil, fmt.Errorf("recreate consumer %s: %w", cfg.Durable, delErr)
			}
		}
	}

	consumer, err := stream.CreateOrUpdateConsumer(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("ensure consumer %s: %w", cfg.Durable, err)
	}
	return consumer, nil
}

// Reconcile deletes durables on the stream that this app no longer owns.
// keepExact names durables belonging to the calling process, which are never
// treated as abandoned however quiet their pulls are.
func (s *Stream) Reconcile(ctx context.Context, keepExact ...string) (StreamConsumerReconcileResult, error) {
	stream, err := s.Ensure(ctx)
	if err != nil {
		return StreamConsumerReconcileResult{}, err
	}
	policy := s.spec.Keep
	policy.KeepExact = append(append([]string(nil), policy.KeepExact...), keepExact...)
	return ReconcileStreamConsumers(ctx, stream, policy)
}

func withOwnerMetadata(in map[string]string) map[string]string {
	out := make(map[string]string, len(in)+1)
	maps.Copy(out, in)
	out[MetadataOwnerKey] = MetadataOwnerValue
	return out
}

// StreamReconcileResult summarises a pass over the server's streams.
type StreamReconcileResult struct {
	Listed  int
	Skipped int // streams this app does not own
	Deleted int
}

// ReconcileStreams deletes streams this app owns that no longer appear in
// [Specs]. Retiring a stream is therefore deleting its spec.
//
// Only streams carrying the ownership stamp are candidates, so a KV or
// object-store backing stream, or one an operator made, is never touched.
// Deleting a stream destroys its messages: the streams here carry live delivery
// and re-runnable work, never the only copy of anything.
func (n *NATS) ReconcileStreams(ctx context.Context) (StreamReconcileResult, error) {
	var result StreamReconcileResult
	if n == nil || n.js == nil {
		return result, fmt.Errorf("nats handle is required")
	}

	declared := make(map[string]struct{}, len(Specs()))
	for _, spec := range Specs() {
		declared[spec.Name] = struct{}{}
	}

	lister := n.js.ListStreams(ctx)
	var infos []*jetstream.StreamInfo
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
		if _, ok := declared[info.Config.Name]; ok {
			continue
		}
		if err := n.js.DeleteStream(ctx, info.Config.Name); err != nil {
			logs.WarnCtx(ctx, "failed to delete obsolete stream", "stream", info.Config.Name, "error", err)
			continue
		}
		logs.InfoCtx(ctx, "deleted obsolete stream", "stream", info.Config.Name)
		result.Deleted++
	}
	return result, nil
}
