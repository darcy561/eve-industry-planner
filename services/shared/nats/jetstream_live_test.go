package nats

import (
	"context"
	"testing"
	"time"

	natsserver "github.com/nats-io/nats-server/v2/server"
	natslib "github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"
)

func startTestJS(t *testing.T) (jetstream.JetStream, func()) {
	t.Helper()
	opts := &natsserver.Options{Host: "127.0.0.1", Port: -1, JetStream: true, StoreDir: t.TempDir()}
	ns, err := natsserver.NewServer(opts)
	if err != nil {
		t.Fatal(err)
	}
	go ns.Start()
	if !ns.ReadyForConnections(5 * time.Second) {
		t.Fatal("nats not ready")
	}
	nc, err := natslib.Connect(ns.ClientURL())
	if err != nil {
		ns.Shutdown()
		t.Fatal(err)
	}
	js, err := jetstream.New(nc)
	if err != nil {
		nc.Close()
		ns.Shutdown()
		t.Fatal(err)
	}
	return js, func() {
		nc.Close()
		ns.Shutdown()
	}
}

func TestLiveSelectiveFanoutFiltersAndColonTenant(t *testing.T) {
	js, cleanup := startTestJS(t)
	defer cleanup()
	ctx := context.Background()

	if err := EnsureDocUpdateStream(js); err != nil {
		t.Fatal(err)
	}
	stream, err := js.Stream(ctx, DocUpdateStream)
	if err != nil {
		t.Fatal(err)
	}

	hostCfg := jetstream.ConsumerConfig{
		Durable:        "host-a",
		FilterSubjects: []string{DocUpdateFilterInert},
		DeliverPolicy:  jetstream.DeliverNewPolicy,
		AckPolicy:      jetstream.AckExplicitPolicy,
	}
	otherCfg := jetstream.ConsumerConfig{
		Durable:        "host-b",
		FilterSubjects: []string{DocUpdateFilterInert},
		DeliverPolicy:  jetstream.DeliverNewPolicy,
		AckPolicy:      jetstream.AckExplicitPolicy,
	}
	host, err := GetOrCreateConsumer(ctx, stream, hostCfg)
	if err != nil {
		t.Fatal(err)
	}
	other, err := GetOrCreateConsumer(ctx, stream, otherCfg)
	if err != nil {
		t.Fatal(err)
	}

	if err := UpdateConsumerFilterSubjects(ctx, stream, "host-a",
		DocUpdateFiltersForHostedTenants([]string{"account:acct-1"})); err != nil {
		t.Fatal(err)
	}
	// other stays inert

	subj := DocUpdateSubject("account:acct-1", "jobs", "doc-99")
	if _, err := js.Publish(ctx, subj, []byte(`{"collection":"jobs","docID":"doc-99","accountID":"acct-1"}`)); err != nil {
		t.Fatal(err)
	}
	noise := DocUpdateSubject("account:other", "jobs", "doc-1")
	if _, err := js.Publish(ctx, noise, []byte(`{"collection":"jobs","docID":"doc-1","accountID":"other"}`)); err != nil {
		t.Fatal(err)
	}

	hostMsgs, err := host.Fetch(2, jetstream.FetchMaxWait(800*time.Millisecond))
	if err != nil {
		t.Fatal(err)
	}
	var got []string
	for msg := range hostMsgs.Messages() {
		got = append(got, msg.Subject())
		_ = msg.Ack()
	}
	if len(got) != 1 || got[0] != subj {
		t.Fatalf("host fetched %v want [%s]", got, subj)
	}

	otherMsgs, err := other.Fetch(1, jetstream.FetchMaxWait(300*time.Millisecond))
	nOther := 0
	if err == nil {
		for range otherMsgs.Messages() {
			nOther++
		}
	}
	if nOther != 0 {
		t.Fatalf("non-host should pull 0, got %d", nOther)
	}

	// Mutable filter update must not require recreate (same durable).
	if err := UpdateConsumerFilterSubjects(ctx, stream, "host-a",
		DocUpdateFiltersForHostedTenants([]string{"account:acct-1", "corporation:10"})); err != nil {
		t.Fatal(err)
	}
	info, err := host.Info(ctx)
	if err != nil {
		t.Fatal(err)
	}
	filters := ConsumerFilterSubjects(info.Config)
	want := []string{"doc.update.account:acct-1.>", "doc.update.corporation:10.>"}
	if !subjectsAsSetEqual(filters, want) {
		t.Fatalf("filters %v want %v", filters, want)
	}

	// GetOrCreate with drifted filters updates in place.
	hostCfg.FilterSubjects = DocUpdateFiltersForHostedTenants([]string{"account:acct-1"})
	again, err := GetOrCreateConsumer(ctx, stream, hostCfg)
	if err != nil {
		t.Fatal(err)
	}
	info2, err := again.Info(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if !subjectsAsSetEqual(ConsumerFilterSubjects(info2.Config), []string{"doc.update.account:acct-1.>"}) {
		t.Fatalf("reconciled filters %v", ConsumerFilterSubjects(info2.Config))
	}
}

func TestLiveUpdateConsumerFilterSubjectsNoop(t *testing.T) {
	js, cleanup := startTestJS(t)
	defer cleanup()
	ctx := context.Background()
	_ = EnsureDocUpdateStream(js)
	stream, _ := js.Stream(ctx, DocUpdateStream)
	_, err := GetOrCreateConsumer(ctx, stream, jetstream.ConsumerConfig{
		Durable:        "noop",
		FilterSubjects: []string{DocUpdateFilterInert},
		DeliverPolicy:  jetstream.DeliverNewPolicy,
		AckPolicy:      jetstream.AckExplicitPolicy,
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := UpdateConsumerFilterSubjects(ctx, stream, "noop", []string{DocUpdateFilterInert}); err != nil {
		t.Fatal(err)
	}
}
