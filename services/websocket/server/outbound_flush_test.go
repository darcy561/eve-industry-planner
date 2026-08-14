package server

import (
	"context"
	"testing"
	"time"

	natscore "eve-industry-planner/shared/core/nats"
)

func TestFlushOutboundShardsEmptyOK(t *testing.T) {
	t.Parallel()
	s := &Server{
		docUpdateOutboundShards: []chan docUpdateWork{make(chan docUpdateWork, 1)},
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	s.flushOutboundShards(ctx)
	if s.outboundQueuedCount() != 0 {
		t.Fatalf("queued=%d", s.outboundQueuedCount())
	}
}

func TestFlushOutboundShardsRespectsCancel(t *testing.T) {
	t.Parallel()
	ch := make(chan docUpdateWork, 1)
	ch <- docUpdateWork{collectionScopedDocID: "stuck"} // no worker → stays queued
	s := &Server{docUpdateOutboundShards: []chan docUpdateWork{ch}}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	started := time.Now()
	s.flushOutboundShards(ctx)
	if time.Since(started) > time.Second {
		t.Fatal("flush blocked too long on canceled context")
	}
	if s.outboundQueuedCount() != 1 {
		t.Fatalf("queued=%d", s.outboundQueuedCount())
	}
}

func TestDrainForRollPublishesDraining(t *testing.T) {
	t.Setenv("HOSTNAME", "websocket-drain-pub")
	intake, shutdown := testServerChans()
	var got natscore.PlacementState
	var pubs int
	s := &Server{
		Clients:        make(map[string]*Client),
		intakeStopChan: intake,
		shutdownChan:   shutdown,
		placementPublishFn: func(_ string, data []byte) error {
			pubs++
			st, err := natscore.ParsePlacementState(data)
			if err != nil {
				t.Errorf("parse: %v", err)
				return err
			}
			got = st
			return nil
		},
	}
	s.DrainForRoll(context.Background())
	if pubs < 1 {
		t.Fatal("expected placement publish")
	}
	if !got.Draining || got.ContainerID == "" {
		t.Fatalf("got %+v", got)
	}
}
