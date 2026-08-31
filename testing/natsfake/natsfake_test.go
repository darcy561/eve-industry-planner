package natsfake

import (
	"context"
	"testing"

	"github.com/nats-io/nats.go/jetstream"
)

func TestNew_servesJetStream(t *testing.T) {
	fake := New(t)

	if !fake.NATS.Connected() {
		t.Fatal("handle reports not connected")
	}
	if err := fake.NATS.Ping(context.Background()); err != nil {
		t.Fatalf("Ping: %v", err)
	}

	ctx := context.Background()
	if _, err := fake.JS().CreateStream(ctx, jetstream.StreamConfig{
		Name:     "NATSFAKE",
		Subjects: []string{"natsfake.>"},
	}); err != nil {
		t.Fatalf("CreateStream: %v", err)
	}
}

// Each test gets its own server, so streams never leak between them.
func TestNew_isolatesStreams(t *testing.T) {
	fake := New(t)
	if _, err := fake.JS().Stream(context.Background(), "NATSFAKE"); err == nil {
		t.Fatal("stream from another test is visible")
	}
}
