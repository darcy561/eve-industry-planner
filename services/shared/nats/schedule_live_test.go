package nats_test

import (
	"context"
	"testing"
	"time"

	eipnats "eve-industry-planner/shared/nats"
	"eve-industry-planner/testing/natsfake"

	"github.com/nats-io/nats.go/jetstream"
)

// A schedule fires on its own subject under scheduled., carrying its payload.
func TestLiveScheduleFires(t *testing.T) {
	fake := natsfake.New(t)
	ctx := context.Background()

	stream, err := fake.NATS.Schedules.Ensure(ctx)
	if err != nil {
		t.Fatal(err)
	}
	cons, err := fake.NATS.Schedules.Consumer(ctx, jetstream.ConsumerConfig{
		Durable:       eipnats.ConsumerScheduleRunner,
		FilterSubject: "scheduled.>",
		AckPolicy:     jetstream.AckExplicitPolicy,
	})
	if err != nil {
		t.Fatal(err)
	}
	_ = stream

	if err := fake.NATS.ScheduleAt(ctx, "fires-soon", time.Now().Add(time.Second), []byte(`{"why":"test"}`)); err != nil {
		t.Fatal(err)
	}
	msg, err := cons.Next(jetstream.FetchMaxWait(5 * time.Second))
	if err != nil {
		t.Fatalf("schedule never fired: %v", err)
	}
	if got := msg.Subject(); got != "scheduled.fires-soon" {
		t.Fatalf("delivered on %q", got)
	}
	if string(msg.Data()) != `{"why":"test"}` {
		t.Fatalf("payload %q", msg.Data())
	}
}

// Scheduling under an existing id replaces it rather than adding a second.
func TestLiveScheduleReplacesByID(t *testing.T) {
	fake := natsfake.New(t)
	ctx := context.Background()

	if err := fake.NATS.ScheduleAt(ctx, "replaced", time.Now().Add(time.Hour), []byte(`first`)); err != nil {
		t.Fatal(err)
	}
	if err := fake.NATS.ScheduleAt(ctx, "replaced", time.Now().Add(2*time.Hour), []byte(`second`)); err != nil {
		t.Fatal(err)
	}

	all, err := fake.NATS.ListSchedules(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(all) != 1 {
		t.Fatalf("listed %d schedules, want 1", len(all))
	}
	if string(all[0].Payload) != "second" {
		t.Fatalf("payload %q, want the replacement", all[0].Payload)
	}
}

// A cancelled schedule does not fire and is no longer listed.
func TestLiveScheduleCancel(t *testing.T) {
	fake := natsfake.New(t)
	ctx := context.Background()

	cons, err := fake.NATS.Schedules.Consumer(ctx, jetstream.ConsumerConfig{
		Durable:       eipnats.ConsumerScheduleRunner,
		FilterSubject: "scheduled.>",
		AckPolicy:     jetstream.AckExplicitPolicy,
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := fake.NATS.ScheduleAt(ctx, "cancelled", time.Now().Add(2*time.Second), nil); err != nil {
		t.Fatal(err)
	}
	if err := fake.NATS.CancelSchedule(ctx, "cancelled"); err != nil {
		t.Fatal(err)
	}

	if _, ok, err := fake.NATS.LookupSchedule(ctx, "cancelled"); err != nil {
		t.Fatal(err)
	} else if ok {
		t.Fatal("cancelled schedule is still listed")
	}
	if _, err := cons.Next(jetstream.FetchMaxWait(4 * time.Second)); err == nil {
		t.Fatal("cancelled schedule still fired")
	}
}

// Inspecting reports the time the server holds, not what a caller once asked for.
func TestLiveScheduleLookupReportsFireTime(t *testing.T) {
	fake := natsfake.New(t)
	ctx := context.Background()

	at := time.Now().Add(90 * time.Minute).UTC().Truncate(time.Second)
	if err := fake.NATS.ScheduleAt(ctx, "inspect-me", at, []byte(`{}`)); err != nil {
		t.Fatal(err)
	}
	got, ok, err := fake.NATS.LookupSchedule(ctx, "inspect-me")
	if err != nil || !ok {
		t.Fatalf("lookup: %v ok=%v", err, ok)
	}
	if !got.At.Equal(at) {
		t.Fatalf("At = %v, want %v", got.At, at)
	}
}

func TestLiveScheduleCancelUnknownIsNotAnError(t *testing.T) {
	fake := natsfake.New(t)
	if err := fake.NATS.CancelSchedule(context.Background(), "never-existed"); err != nil {
		t.Fatalf("cancelling an absent schedule: %v", err)
	}
}

// A cron job's name carries a dot, so an id must tolerate one.
func TestScheduleIDAcceptsDottedName(t *testing.T) {
	fake := natsfake.New(t)
	ctx := context.Background()
	if err := fake.NATS.ScheduleAt(ctx, "cron.industrySystemsRefresh", time.Now().Add(time.Hour), nil); err != nil {
		t.Fatalf("dotted id rejected: %v", err)
	}
	got, ok, err := fake.NATS.LookupSchedule(ctx, "cron.industrySystemsRefresh")
	if err != nil || !ok {
		t.Fatalf("lookup: %v ok=%v", err, ok)
	}
	if got.ID != "cron.industrySystemsRefresh" {
		t.Fatalf("id round-tripped as %q", got.ID)
	}
}

func TestScheduleIDRejectsSubjectTokens(t *testing.T) {
	fake := natsfake.New(t)
	ctx := context.Background()
	for _, id := range []string{"", " padded", "has space", "wild*", "deep>", ".leading", "trailing.", "double..dot"} {
		if err := fake.NATS.ScheduleAt(ctx, id, time.Now().Add(time.Hour), nil); err == nil {
			t.Errorf("id %q was accepted", id)
		}
	}
}
