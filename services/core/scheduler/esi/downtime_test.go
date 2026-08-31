package esi

import (
	"context"
	"errors"
	"testing"
	"time"
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

func TestIsInEVEDowntime(t *testing.T) {
	cases := []struct {
		name string
		now  time.Time
		in   bool
	}{
		{"before the window", time.Date(2026, 8, 31, 10, 59, 59, 0, time.UTC), false},
		{"window opens", time.Date(2026, 8, 31, 11, 0, 0, 0, time.UTC), true},
		{"mid window", time.Date(2026, 8, 31, 11, 7, 0, 0, time.UTC), true},
		{"window closes", time.Date(2026, 8, 31, 11, 15, 0, 0, time.UTC), false},
		{"non-utc zone inside the window", time.Date(2026, 8, 31, 12, 5, 0, 0, time.FixedZone("CET", 3600)), true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			in, end := isInEVEDowntime(tc.now)
			if in != tc.in {
				t.Fatalf("isInEVEDowntime(%s) = %v, want %v", tc.now, in, tc.in)
			}
			if in && !end.Equal(time.Date(2026, 8, 31, 11, 15, 0, 0, time.UTC)) {
				t.Fatalf("window end = %s, want 11:15 UTC", end)
			}
		})
	}
}

func TestDeferPublicationOutsideDowntimeDoesNotSchedule(t *testing.T) {
	sched := &fakeScheduler{}
	deferred, err := DeferPublicationUntilAfterDowntime(context.Background(), sched, "cron.job", time.Date(2026, 8, 31, 9, 0, 0, 0, time.UTC))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if deferred {
		t.Fatal("publication deferred outside the downtime window")
	}
	if len(sched.calls) != 0 {
		t.Fatalf("scheduled %d runs outside the window", len(sched.calls))
	}
}

func TestDeferPublicationSchedulesAfterTheWindow(t *testing.T) {
	sched := &fakeScheduler{}
	deferred, err := DeferPublicationUntilAfterDowntime(context.Background(), sched, "cron.job", time.Date(2026, 8, 31, 11, 1, 0, 0, time.UTC))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !deferred {
		t.Fatal("publication not deferred during the downtime window")
	}
	want := time.Date(2026, 8, 31, 11, 15, 2, 0, time.UTC)
	if len(sched.calls) != 1 || sched.calls[0].id != "cron.job" || !sched.calls[0].at.Equal(want) {
		t.Fatalf("scheduled %+v, want one run of cron.job at %s", sched.calls, want)
	}
}

func TestDeferPublicationKeepsOneScheduleIDPerJob(t *testing.T) {
	sched := &fakeScheduler{}
	for _, now := range []time.Time{
		time.Date(2026, 8, 31, 11, 1, 0, 0, time.UTC),
		time.Date(2026, 8, 31, 11, 11, 0, 0, time.UTC),
	} {
		if _, err := DeferPublicationUntilAfterDowntime(context.Background(), sched, "cron.job", now); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	}
	if len(sched.calls) != 2 {
		t.Fatalf("got %d schedule calls, want 2", len(sched.calls))
	}
	if sched.calls[0].id != sched.calls[1].id || !sched.calls[0].at.Equal(sched.calls[1].at) {
		t.Fatalf("ticks in one window scheduled differently: %+v", sched.calls)
	}
}

func TestDeferPublicationReportsAFailedSchedule(t *testing.T) {
	wantErr := errors.New("nats unreachable")
	sched := &fakeScheduler{err: wantErr}
	deferred, err := DeferPublicationUntilAfterDowntime(context.Background(), sched, "cron.job", time.Date(2026, 8, 31, 11, 1, 0, 0, time.UTC))
	if !errors.Is(err, wantErr) {
		t.Fatalf("error = %v, want it to wrap %v", err, wantErr)
	}
	if deferred {
		t.Fatal("reported deferred after the schedule failed")
	}
}
