package mongo

import (
	"context"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

func TestMonitorMongoConnectionStopsOnceTheClientIsDisconnected(t *testing.T) {
	t.Parallel()

	client, err := mongo.Connect(options.Client().ApplyURI("mongodb://127.0.0.1:1").SetServerSelectionTimeout(10 * time.Millisecond))
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	if err := client.Disconnect(context.Background()); err != nil {
		t.Fatalf("disconnect: %v", err)
	}

	stopped := make(chan struct{})
	go func() {
		monitorMongoConnection(client, 5*time.Millisecond)
		close(stopped)
	}()

	select {
	case <-stopped:
	case <-time.After(5 * time.Second):
		t.Fatal("the monitor kept running against a disconnected client")
	}
}
