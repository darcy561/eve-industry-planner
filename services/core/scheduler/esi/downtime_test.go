package esi

import (
	"context"
	"errors"
	"testing"
	"time"

	rediscore "eve-industry-planner/shared/core/redis"
	"eve-industry-planner/shared/esiclient"
	"eve-industry-planner/testing/esifake"
	"eve-industry-planner/testing/redisfake"
)

type fakeScheduler struct {
	calls []scheduledCall
	err   error
}

type scheduledCall struct {
	id string
	at time.Time
}

func (f *fakeScheduler) ScheduleAt(_ context.Context, id string, at time.Time, _ []byte) error {
	if f.err != nil {
		return f.err
	}
	f.calls = append(f.calls, scheduledCall{id: id, at: at})
	return nil
}

// gatedAt builds a client reporting an outage whose next probe is at probe.
func gatedAt(t *testing.T, probe time.Time) *esifake.Client {
	t.Helper()
	esi := esifake.New(t)
	esi.SetAvailability(esiclient.DowntimeState{Gated: true, NextProbe: probe, Failures: 4})
	return esi
}

func TestDeferPublicationPublishesWhileTheServersAnswer(t *testing.T) {
	sched := &fakeScheduler{}
	esi := esifake.New(t)

	deferred, err := DeferPublicationUntilAfterDowntime(context.Background(), sched, "cron.job", esi)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if deferred {
		t.Fatal("publication deferred while ESI was answering")
	}
	if len(sched.calls) != 0 {
		t.Fatalf("scheduled %d runs with nothing wrong", len(sched.calls))
	}
}

func TestDeferPublicationSchedulesForTheNextProbe(t *testing.T) {
	probe := time.Now().Add(6 * time.Minute)
	sched := &fakeScheduler{}

	deferred, err := DeferPublicationUntilAfterDowntime(context.Background(), sched, "cron.job", gatedAt(t, probe))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !deferred {
		t.Fatal("publication not deferred while ESI was gated")
	}

	// The run lands just after the limiter intends to probe, so it asks once
	// that probe has answered rather than racing it.
	want := probe.Add(downtimeScheduleMargin)
	if len(sched.calls) != 1 || sched.calls[0].id != "cron.job" || !sched.calls[0].at.Equal(want) {
		t.Fatalf("scheduled %+v, want one run of cron.job at %s", sched.calls, want)
	}
}

func TestDeferPublicationFollowsTheProbeBackoff(t *testing.T) {
	// The probe interval widens while an outage lasts, so a long maintenance
	// produces fewer and fewer deferrals rather than one per cron tick.
	sched := &fakeScheduler{}
	first := time.Now().Add(2 * time.Minute)
	later := time.Now().Add(6 * time.Minute)

	for _, probe := range []time.Time{first, later} {
		if _, err := DeferPublicationUntilAfterDowntime(context.Background(), sched, "cron.job", gatedAt(t, probe)); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	}

	if len(sched.calls) != 2 {
		t.Fatalf("got %d schedule calls, want 2", len(sched.calls))
	}
	// One id per job, so the later deferral replaces the earlier one rather
	// than stacking up a queue of pending runs.
	if sched.calls[0].id != sched.calls[1].id {
		t.Errorf("deferrals used different ids: %+v", sched.calls)
	}
	if !sched.calls[1].at.After(sched.calls[0].at) {
		t.Errorf("the second deferral was not pushed back: %+v", sched.calls)
	}
}

func TestDeferPublicationPublishesWhenAvailabilityCannotBeRead(t *testing.T) {
	// Nothing is known, so the call itself is the test — better to try and be
	// refused than to stop publishing because Redis blinked.
	sched := &fakeScheduler{}

	deferred, err := DeferPublicationUntilAfterDowntime(context.Background(), sched, "cron.job", nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if deferred {
		t.Fatal("publication deferred with no availability to go on")
	}
}

func TestDeferPublicationReportsAFailedSchedule(t *testing.T) {
	wantErr := errors.New("nats unreachable")
	sched := &fakeScheduler{err: wantErr}
	probe := time.Now().Add(6 * time.Minute)

	deferred, err := DeferPublicationUntilAfterDowntime(context.Background(), sched, "cron.job", gatedAt(t, probe))
	if !errors.Is(err, wantErr) {
		t.Fatalf("error = %v, want it to wrap %v", err, wantErr)
	}
	if deferred {
		t.Fatal("reported deferred after the schedule failed")
	}
}

func TestDeferPublicationPublishesWhenNothingHasBeenFetched(t *testing.T) {
	// No freshness recorded means the first pass has not happened, and that pass
	// is what establishes one.
	sched := &fakeScheduler{}
	fake := redisfake.New(t)

	deferred, err := DeferPublicationUntilStale(context.Background(), sched, "cron.job",
		rediscore.DatasetMarketPrices, fake.Client, time.Now())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if deferred {
		t.Fatal("deferred with no freshness to go on")
	}
}

func TestDeferPublicationWaitsForTheAdvertisedMaxAge(t *testing.T) {
	sched := &fakeScheduler{}
	fake := redisfake.New(t)
	now := time.Now()
	stale := now.Add(20 * time.Minute)

	if err := rediscore.SaveNextRefresh(context.Background(), fake.Client, rediscore.DatasetMarketPrices, stale); err != nil {
		t.Fatalf("seeding freshness: %v", err)
	}

	deferred, err := DeferPublicationUntilStale(context.Background(), sched, "cron.job",
		rediscore.DatasetMarketPrices, fake.Client, now)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !deferred {
		t.Fatal("published inside the window ESI said the answer stays good for")
	}

	want := stale.Add(freshnessScheduleMargin)
	if len(sched.calls) != 1 || !sched.calls[0].at.Round(time.Second).Equal(want.Round(time.Second)) {
		t.Fatalf("scheduled %+v, want one run at %s", sched.calls, want)
	}
}

func TestDeferPublicationPublishesOnceTheDataIsStale(t *testing.T) {
	sched := &fakeScheduler{}
	fake := redisfake.New(t)
	now := time.Now()

	if err := rediscore.SaveNextRefresh(context.Background(), fake.Client,
		rediscore.DatasetMarketPrices, now.Add(-time.Minute)); err != nil {
		t.Fatalf("seeding freshness: %v", err)
	}

	deferred, err := DeferPublicationUntilStale(context.Background(), sched, "cron.job",
		rediscore.DatasetMarketPrices, fake.Client, now)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if deferred {
		t.Fatal("deferred data that has already expired")
	}
	if len(sched.calls) != 0 {
		t.Fatalf("scheduled %d runs for data due now", len(sched.calls))
	}
}

func TestDeferPublicationNeverSchedulesIntoThePast(t *testing.T) {
	// A next-probe time says a probe is due, not that one has happened, so it is
	// routinely already past. Booking the run for then would fire it straight
	// back into the closed gate.
	sched := &fakeScheduler{}
	before := time.Now()

	deferred, err := DeferPublicationUntilAfterDowntime(context.Background(), sched, "cron.job",
		gatedAt(t, before.Add(-time.Hour)))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !deferred {
		t.Fatal("publication not deferred while ESI was gated")
	}
	if len(sched.calls) != 1 {
		t.Fatalf("scheduled %d runs, want 1", len(sched.calls))
	}
	if at := sched.calls[0].at; !at.After(before) {
		t.Errorf("scheduled at %s, which is not after now (%s)", at, before)
	}
}
