package nats

import (
	"context"
	"fmt"
	"maps"
	"sync"

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
		Name:      s.spec.Name,
		Subjects:  append([]string(nil), s.spec.Subjects...),
		Retention: jetstream.LimitsPolicy,
		Storage:   jetstream.FileStorage,
		MaxAge:    s.spec.MaxAge,
		Metadata:  map[string]string{MetadataOwnerKey: MetadataOwnerValue},
	})
	if err != nil {
		return nil, fmt.Errorf("ensure stream %s: %w", s.spec.Name, err)
	}
	s.bound = stream
	return stream, nil
}

// Consumer creates or updates a durable on the stream, stamping ownership so
// reconcile can tell this app's durables from anything else on the server.
// A DeliverPolicy change is applied with ResetConsumer rather than by deleting
// and recreating, which would discard the durable's ack floor.
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
			if _, resetErr := stream.ResetConsumer(ctx, cfg.Durable); resetErr != nil {
				return nil, fmt.Errorf("reset consumer %s: %w", cfg.Durable, resetErr)
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
