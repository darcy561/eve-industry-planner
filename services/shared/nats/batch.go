package nats

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"time"

	natslib "github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"
)

// asyncPublishTimeout bounds how long a batched publish waits for its ack. The
// client leaves this off by default, which would let a lost ack hang a batch
// forever.
const asyncPublishTimeout = 30 * time.Second

// batch holds the acks a batching handle is still waiting on.
type batch struct {
	mu      sync.Mutex
	pending []jetstream.PubAckFuture
}

// Batching returns a handle that publishes without waiting for each ack, for a
// caller sending many messages in a loop. The same publish helpers work on it;
// what changes is that the round trips overlap.
//
// Every batching handle must be finished with [NATS.Wait], which is where a
// publish failure is reported. Until then nothing is known to have been stored.
func (n *NATS) Batching() *NATS {
	if n == nil {
		return nil
	}
	batched := *n
	batched.batch = &batch{}
	return &batched
}

// Wait blocks until every message this handle published has been acknowledged,
// and reports what failed. It is safe to call more than once.
func (n *NATS) Wait(ctx context.Context) error {
	if n == nil || n.batch == nil {
		return nil
	}
	n.batch.mu.Lock()
	pending := n.batch.pending
	n.batch.pending = nil
	n.batch.mu.Unlock()

	var failures []error
	for _, future := range pending {
		select {
		case err := <-future.Err():
			failures = append(failures, err)
		case <-future.Ok():
		case <-ctx.Done():
			return errors.Join(append(failures, ctx.Err())...)
		}
	}
	if len(failures) == 0 {
		return nil
	}
	return fmt.Errorf("%d of %d batched publishes failed: %w", len(failures), len(pending), errors.Join(failures...))
}

// Pending reports how many acks this handle is still waiting on.
func (n *NATS) Pending() int {
	if n == nil || n.batch == nil {
		return 0
	}
	n.batch.mu.Lock()
	defer n.batch.mu.Unlock()
	return len(n.batch.pending)
}

// publishAsync sends without waiting and records the ack for [NATS.Wait].
func (n *NATS) publishAsync(msg *natslib.Msg) error {
	future, err := n.js.PublishMsgAsync(msg)
	if err != nil {
		return err
	}
	n.batch.mu.Lock()
	n.batch.pending = append(n.batch.pending, future)
	n.batch.mu.Unlock()
	return nil
}
