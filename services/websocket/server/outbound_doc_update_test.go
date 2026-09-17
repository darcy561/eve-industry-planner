package server

import (
	"context"
	"testing"
	"time"

	"github.com/nats-io/nats.go/jetstream"
)

type queuedMsg struct {
	jetstream.Msg
	data     []byte
	sequence uint64
}

func (m *queuedMsg) Data() []byte { return m.data }

func (m *queuedMsg) Subject() string { return "doc.update.acct" }

func (m *queuedMsg) Metadata() (*jetstream.MsgMetadata, error) {
	return &jetstream.MsgMetadata{Sequence: jetstream.SequencePair{Stream: m.sequence}}, nil
}

// A shard is an owner's queue, so a message that cannot be placed waits for room.
// Delivering it there and then would put the newest change ahead of every change
// already queued for that owner — and a full shard is exactly when that owner is
// busiest, so it is the worst moment to reorder.
func TestAFullShardHoldsTheMessageRatherThanOvertaking(t *testing.T) {
	t.Parallel()
	shard := make(chan docUpdateWork, 2)
	s := &Server{
		docUpdateOutboundShards: []chan docUpdateWork{shard},
		shutdownChan:            make(chan struct{}),
	}
	for _, id := range []string{"first", "second"} {
		s.enqueueOutboundDocUpdate(context.Background(), id, "doc.update.acct", &queuedMsg{data: []byte("{}")})
	}

	placed := make(chan struct{})
	go func() {
		s.enqueueOutboundDocUpdate(context.Background(), "third", "doc.update.acct", &queuedMsg{data: []byte("{}")})
		close(placed)
	}()

	select {
	case <-placed:
		t.Fatal("enqueue returned while the shard was full; the message went around the queue")
	case <-time.After(50 * time.Millisecond):
	}

	if got := (<-shard).collectionScopedDocID; got != "first" {
		t.Fatalf("head of the queue = %q, want %q", got, "first")
	}
	<-placed

	for _, want := range []string{"second", "third"} {
		if got := (<-shard).collectionScopedDocID; got != want {
			t.Fatalf("next in the queue = %q, want %q", got, want)
		}
	}
}

// Shutting down while a shard is full delivers the message rather than refusing
// it. This container's durable is deleted at the start of a drain and the
// consumer delivers from new, so a refusal here is a lost change, not a
// redelivered one.
func TestAFullShardAtShutdownStillDeliversTheMessage(t *testing.T) {
	t.Parallel()
	shard := make(chan docUpdateWork, 1)
	shutdown := make(chan struct{})
	s := &Server{
		Clients:                 make(map[string]*Client),
		docUpdateOutboundShards: []chan docUpdateWork{shard},
		shutdownChan:            shutdown,
	}
	s.enqueueOutboundDocUpdate(context.Background(), "first", "doc.update.acct", &queuedMsg{data: []byte("{}")})

	placed := make(chan struct{})
	go func() {
		s.enqueueOutboundDocUpdate(context.Background(), "second", "doc.update.acct", &queuedMsg{data: []byte("{}")})
		close(placed)
	}()
	time.Sleep(20 * time.Millisecond)
	close(shutdown)

	select {
	case <-placed:
	case <-time.After(time.Second):
		t.Fatal("enqueue did not give up waiting at shutdown")
	}
	if len(shard) != 1 {
		t.Fatalf("shard holds %d, want the one message queued before shutdown", len(shard))
	}
}

// A message parked waiting for room has left the stream and is in no queue, so a
// drain that counted only the queues and the workers would close the sockets it
// is for and call itself finished.
//
// The shard here is unbuffered, so nothing is ever queued and no worker is ever
// in flight: the parked message is the only thing a flush could be waiting for.
func TestADrainWaitsForAMessageStillLookingForRoom(t *testing.T) {
	t.Parallel()
	shard := make(chan docUpdateWork)
	shutdown := make(chan struct{})
	defer close(shutdown)
	s := &Server{
		docUpdateOutboundShards: []chan docUpdateWork{shard},
		shutdownChan:            shutdown,
	}

	quick, cancelQuick := context.WithTimeout(context.Background(), 150*time.Millisecond)
	defer cancelQuick()
	s.flushOutboundShards(quick)
	if quick.Err() != nil {
		t.Fatal("flush waited with nothing outstanding")
	}

	go func() {
		s.enqueueOutboundDocUpdate(context.Background(), "parked", "doc.update.acct", &queuedMsg{data: []byte("{}")})
	}()
	waitFor(t, func() bool { return s.outboundWaitingForRoom.Load() == 1 })

	if s.outboundQueuedCount() != 0 || s.outboundInFlight.Load() != 0 {
		t.Fatalf("queued=%d in_flight=%d, want the parked message to be the only outstanding work",
			s.outboundQueuedCount(), s.outboundInFlight.Load())
	}

	ctx, cancel := context.WithTimeout(context.Background(), 150*time.Millisecond)
	defer cancel()
	s.flushOutboundShards(ctx)
	if ctx.Err() == nil {
		t.Fatal("flush reported complete while a message was still waiting for room")
	}
}

func waitFor(t *testing.T, cond func() bool) {
	t.Helper()
	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		if cond() {
			return
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatal("condition not met in time")
}

// A cancelled context stops the wait for the same reason a shutdown does: what is
// held here reaches nobody if it is simply dropped, so it is delivered late.
func TestACancelledContextEndsTheWaitForRoom(t *testing.T) {
	t.Parallel()
	shard := make(chan docUpdateWork, 1)
	s := &Server{
		Clients:                 make(map[string]*Client),
		docUpdateOutboundShards: []chan docUpdateWork{shard},
		shutdownChan:            make(chan struct{}),
	}
	s.enqueueOutboundDocUpdate(context.Background(), "first", "doc.update.acct", &queuedMsg{data: []byte("{}")})

	ctx, cancel := context.WithCancel(context.Background())
	placed := make(chan struct{})
	go func() {
		s.enqueueOutboundDocUpdate(ctx, "second", "doc.update.acct", &queuedMsg{data: []byte("{}")})
		close(placed)
	}()
	time.Sleep(20 * time.Millisecond)
	cancel()

	select {
	case <-placed:
	case <-time.After(time.Second):
		t.Fatal("the wait ignored its cancelled context")
	}
	if len(shard) != 1 {
		t.Fatalf("shard holds %d, want the one message queued before the cancel", len(shard))
	}
}
