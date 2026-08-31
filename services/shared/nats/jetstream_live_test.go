package nats_test

import (
	"context"
	"slices"
	"testing"
	"time"

	eipnats "eve-industry-planner/shared/nats"
	"eve-industry-planner/testing/natsfake"

	"github.com/nats-io/nats.go/jetstream"
)

func TestLiveSelectiveFanoutFiltersAndColonTenant(t *testing.T) {
	js := natsfake.New(t).JS()
	ctx := context.Background()

	if err := eipnats.EnsureDocUpdateStream(js); err != nil {
		t.Fatal(err)
	}
	stream, err := js.Stream(ctx, eipnats.DocUpdateStream)
	if err != nil {
		t.Fatal(err)
	}

	hostCfg := jetstream.ConsumerConfig{
		Durable:        "host-a",
		FilterSubjects: []string{eipnats.DocUpdateFilterInert},
		DeliverPolicy:  jetstream.DeliverNewPolicy,
		AckPolicy:      jetstream.AckExplicitPolicy,
	}
	otherCfg := jetstream.ConsumerConfig{
		Durable:        "host-b",
		FilterSubjects: []string{eipnats.DocUpdateFilterInert},
		DeliverPolicy:  jetstream.DeliverNewPolicy,
		AckPolicy:      jetstream.AckExplicitPolicy,
	}
	host, err := eipnats.GetOrCreateConsumer(ctx, stream, hostCfg)
	if err != nil {
		t.Fatal(err)
	}
	other, err := eipnats.GetOrCreateConsumer(ctx, stream, otherCfg)
	if err != nil {
		t.Fatal(err)
	}

	if err := eipnats.UpdateConsumerFilterSubjects(ctx, stream, "host-a",
		eipnats.DocUpdateFiltersForHostedTenants([]string{"account:acct-1"})); err != nil {
		t.Fatal(err)
	}
	// other stays inert

	subj := eipnats.DocUpdateSubject("account:acct-1", "jobs", "doc-99")
	if _, err := js.Publish(ctx, subj, []byte(`{"collection":"jobs","docID":"doc-99","accountID":"acct-1"}`)); err != nil {
		t.Fatal(err)
	}
	noise := eipnats.DocUpdateSubject("account:other", "jobs", "doc-1")
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
	if err := eipnats.UpdateConsumerFilterSubjects(ctx, stream, "host-a",
		eipnats.DocUpdateFiltersForHostedTenants([]string{"account:acct-1", "corporation:10"})); err != nil {
		t.Fatal(err)
	}
	info, err := host.Info(ctx)
	if err != nil {
		t.Fatal(err)
	}
	filters := eipnats.ConsumerFilterSubjects(info.Config)
	want := []string{"doc.update.account:acct-1.>", "doc.update.corporation:10.>"}
	if !slices.Equal(filters, eipnats.NormalizeFilterSubjects(want)) {
		t.Fatalf("filters %v want %v", filters, want)
	}

	// GetOrCreate with drifted filters updates in place.
	hostCfg.FilterSubjects = eipnats.DocUpdateFiltersForHostedTenants([]string{"account:acct-1"})
	again, err := eipnats.GetOrCreateConsumer(ctx, stream, hostCfg)
	if err != nil {
		t.Fatal(err)
	}
	info2, err := again.Info(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if !slices.Equal(eipnats.ConsumerFilterSubjects(info2.Config), []string{"doc.update.account:acct-1.>"}) {
		t.Fatalf("reconciled filters %v", eipnats.ConsumerFilterSubjects(info2.Config))
	}
}

func TestLiveUpdateConsumerFilterSubjectsNoop(t *testing.T) {
	js := natsfake.New(t).JS()
	ctx := context.Background()
	_ = eipnats.EnsureDocUpdateStream(js)
	stream, _ := js.Stream(ctx, eipnats.DocUpdateStream)
	_, err := eipnats.GetOrCreateConsumer(ctx, stream, jetstream.ConsumerConfig{
		Durable:        "noop",
		FilterSubjects: []string{eipnats.DocUpdateFilterInert},
		DeliverPolicy:  jetstream.DeliverNewPolicy,
		AckPolicy:      jetstream.AckExplicitPolicy,
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := eipnats.UpdateConsumerFilterSubjects(ctx, stream, "noop", []string{eipnats.DocUpdateFilterInert}); err != nil {
		t.Fatal(err)
	}
}
