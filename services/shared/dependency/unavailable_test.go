package dependency

import (
	"context"
	"errors"
	"fmt"
	"net"
	"testing"

	"eve-industry-planner/shared/core/documentlock"

	"github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"
	"go.mongodb.org/mongo-driver/mongo"
)

func TestIsUnavailable_redis(t *testing.T) {
	err := fmt.Errorf("an error has occurred with redis command: %w", &net.OpError{
		Op:  "dial",
		Net: "tcp",
		Err: errors.New(`lookup redis on 127.0.0.11:53: no such host`),
	})
	if !IsUnavailable(err) {
		t.Fatal("expected redis dial error to be unavailable")
	}
}

func TestIsUnavailable_mongo(t *testing.T) {
	if IsUnavailable(mongo.ErrNoDocuments) {
		t.Fatal("ErrNoDocuments must not be unavailable")
	}
	if !IsUnavailable(mongo.ErrClientDisconnected) {
		t.Fatal("ErrClientDisconnected should be unavailable")
	}
}

func TestIsUnavailable_nats(t *testing.T) {
	tests := []error{
		nats.ErrConnectionClosed,
		nats.ErrNoServers,
		nats.ErrDisconnected,
		jetstream.ErrConnectionClosed,
		errors.New("nats connection is not connected after retries"),
	}
	for _, err := range tests {
		if !IsUnavailable(err) {
			t.Fatalf("expected unavailable: %v", err)
		}
	}
}

func TestIsUnavailable_notInfrastructure(t *testing.T) {
	if IsUnavailable(context.Canceled) {
		t.Fatal("context.Canceled should not be unavailable")
	}
	if IsUnavailable(errors.New("session not found")) {
		t.Fatal("application errors should not be unavailable")
	}
}

func TestIsUnavailable_documentLocks(t *testing.T) {
	if !IsUnavailable(documentlock.ErrLocksUnavailable) {
		t.Fatal("locks unavailable should map to dependency unavailable")
	}
}
