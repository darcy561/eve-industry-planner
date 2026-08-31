package server

// End-to-end selective fan-out: embedded JetStream + two durables + HostedTenants filters.
//
//	go test ./websocket/server/ -count=1 -run IntegrationSelectiveFanout

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	eipnats "eve-industry-planner/shared/nats"
	"eve-industry-planner/shared/stackservices"
	"eve-industry-planner/testing/natsfake"
	"eve-industry-planner/websocket/server/identity"
	"eve-industry-planner/websocket/server/natslogic"

	"github.com/nats-io/nats.go/jetstream"
)

func TestIntegrationSelectiveFanoutHostPullsNonHostDoesNot(t *testing.T) {
	// Stable HOSTNAME for host durable + reconcile (identity.DocLiveUpdatesJetStreamDurable).
	t.Setenv("HOSTNAME", "websocket-integ-fanout-host")
	fake := natsfake.New(t)
	js := fake.JS()
	ctx := context.Background()

	stream, err := fake.NATS.DocUpdate.Ensure(ctx)
	if err != nil {
		t.Fatal(err)
	}

	// Host replica server (indexes only — pull verified via JetStream durables named like product).
	host := &Server{
		userConnections: map[string]map[string]bool{
			"acct-host": {"c1": true},
		},
		corpRefToClients:     make(map[string]map[string]bool),
		allianceRefToClients: make(map[string]map[string]bool),
		Stack:                &stackservices.Clients{NATS: fake.NATS},
		intakeStopChan:       make(chan struct{}),
		shutdownChan:         make(chan struct{}),
	}
	host.fanoutStream = stream

	liveDurable, liveCfg := natslogic.DocLiveUpdatesConsumerConfig()
	hostCons, err := fake.NATS.DocUpdate.Consumer(ctx, liveCfg)
	if err != nil {
		t.Fatal(err)
	}
	if liveDurable != identity.DocLiveUpdatesJetStreamDurable() {
		t.Fatalf("durable %q", liveDurable)
	}

	// Peer durable stays inert (no HostedTenants reconcile).
	peerCons, err := fake.NATS.DocUpdate.Consumer(ctx, jetstream.ConsumerConfig{
		Durable:           "doc-live-updates-websocket-integ-fanout-peer",
		FilterSubjects:    []string{eipnats.DocUpdateFilterInert},
		DeliverPolicy:     jetstream.DeliverNewPolicy,
		AckPolicy:         jetstream.AckExplicitPolicy,
		InactiveThreshold: eipnats.DocFanoutInactiveThreshold,
	})
	if err != nil {
		t.Fatal(err)
	}

	host.reconcileDocFanoutFilters(ctx)

	info, err := hostCons.Info(ctx)
	if err != nil {
		t.Fatal(err)
	}
	wantFilter := []string{"doc.update.account:acct-host.>"}
	if !filtersEqual(eipnats.ConsumerFilterSubjects(info.Config), wantFilter) {
		t.Fatalf("host filters %v want %v", eipnats.ConsumerFilterSubjects(info.Config), wantFilter)
	}

	payload, _ := json.Marshal(map[string]any{
		"collection": "jobs",
		"docID":      "j1",
		"accountID":  "acct-host",
	})
	subj := eipnats.DocUpdateSubject("account:acct-host", "jobs", "j1")
	if _, err := js.Publish(ctx, subj, payload); err != nil {
		t.Fatal(err)
	}
	otherPayload, _ := json.Marshal(map[string]any{
		"collection": "jobs",
		"docID":      "j2",
		"accountID":  "acct-other",
	})
	if _, err := js.Publish(ctx, eipnats.DocUpdateSubject("account:acct-other", "jobs", "j2"), otherPayload); err != nil {
		t.Fatal(err)
	}

	hostMsgs, err := hostCons.Fetch(2, jetstream.FetchMaxWait(800*time.Millisecond))
	if err != nil {
		t.Fatal(err)
	}
	var hostSubjects []string
	for msg := range hostMsgs.Messages() {
		hostSubjects = append(hostSubjects, msg.Subject())
		scoped, err := collectionScopedDocIDFromDocUpdate(msg.Data(), msg.Subject())
		if err != nil || scoped != "jobs.j1" {
			t.Fatalf("payload parse scoped=%q err=%v", scoped, err)
		}
		_ = msg.Ack()
	}
	if len(hostSubjects) != 1 || hostSubjects[0] != subj {
		t.Fatalf("host got %v", hostSubjects)
	}

	peerMsgs, err := peerCons.Fetch(1, jetstream.FetchMaxWait(300*time.Millisecond))
	n := 0
	if err == nil {
		for range peerMsgs.Messages() {
			n++
		}
	}
	if n != 0 {
		t.Fatalf("peer pulled %d want 0", n)
	}

	// Disconnect host tenant → filters collapse to inert.
	host.userConnections = map[string]map[string]bool{}
	host.reconcileDocFanoutFilters(ctx)
	info2, err := hostCons.Info(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if !filtersEqual(eipnats.ConsumerFilterSubjects(info2.Config), []string{eipnats.DocUpdateFilterInert}) {
		t.Fatalf("after empty host filters %v", eipnats.ConsumerFilterSubjects(info2.Config))
	}
}

func filtersEqual(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	m := map[string]int{}
	for _, s := range a {
		m[s]++
	}
	for _, s := range b {
		m[s]--
		if m[s] < 0 {
			return false
		}
	}
	for _, n := range m {
		if n != 0 {
			return false
		}
	}
	return true
}
