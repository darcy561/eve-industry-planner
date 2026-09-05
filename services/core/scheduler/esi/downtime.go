package esi

import (
	"context"
	"fmt"
	"time"

	esimetrics "eve-industry-planner/core/metrics/esi"
	rediscore "eve-industry-planner/shared/core/redis"
	"eve-industry-planner/shared/esiclient"
	"eve-industry-planner/shared/logs"

	redislib "github.com/redis/go-redis/v9"
)

// Both margins put a deferred run just past the moment it is waiting on, so it
// does not arrive a tick early and race the thing it was deferred for.
const (
	downtimeScheduleMargin  = 2 * time.Second
	freshnessScheduleMargin = 2 * time.Second
)

// publicationScheduler defers a run to a later time under an id that identifies it.
// Scheduling again under one id replaces what was there, so a cron job's name is
// enough to keep one deferral per job.
type publicationScheduler interface {
	ScheduleAt(ctx context.Context, id string, at time.Time, payload []byte) error
}

// DeferPublicationUntilAfterDowntime schedules jobName for the limiter's next
// probe while ESI is not answering, and reports whether it did. While the
// servers answer it reports false and the caller publishes as normal.
//
// A deferral that cannot be scheduled is an error rather than a publication
// into an outage; the next cron tick retries it.
func DeferPublicationUntilAfterDowntime(ctx context.Context, sched publicationScheduler, jobName string, esi esiclient.API) (bool, error) {
	if esi == nil {
		return false, nil
	}

	state, err := esi.Availability(ctx)
	if err != nil {
		// Nothing is known about availability, so the call itself is the test.
		logs.WarnCtx(ctx, "could not read ESI availability, publishing anyway",
			"component", schedulerLogComponent, "job", jobName, "error", err)
		return false, nil
	}
	if !state.Gated {
		return false, nil
	}
	if sched == nil {
		return false, fmt.Errorf("defer %s until ESI answers: scheduler is required", jobName)
	}

	// The probe time is often already past — it says a probe is due, not that one
	// has happened — so the run is floored at the margin rather than booked into
	// the past, where it would fire straight back into the closed gate.
	runAt := state.NextProbe.Add(downtimeScheduleMargin)
	if soonest := time.Now().Add(downtimeScheduleMargin); runAt.Before(soonest) {
		runAt = soonest
	}
	if err := sched.ScheduleAt(ctx, jobName, runAt, nil); err != nil {
		return false, fmt.Errorf("defer %s until ESI answers: %w", jobName, err)
	}

	esimetrics.RecordPublicationSkipped(ctx, jobName, esimetrics.SkipDowntime)
	logs.InfoCtx(ctx, "deferred publication until ESI answers again",
		"component", schedulerLogComponent,
		"job", jobName,
		"failures", state.Failures,
		"next_probe_utc", state.NextProbe.UTC().Format(time.RFC3339),
		"runs_at_utc", runAt.UTC().Format(time.RFC3339))
	return true, nil
}

// DeferPublicationUntilStale schedules jobName for the moment ESI says a
// dataset stops being current, and reports whether it did. A dataset already
// stale — or one nothing has fetched yet — reports false and the caller
// publishes now.
//
// A repeat pass inside the window still costs a token even answering 304, so
// the cheapest call is the one not made. The cron schedule remains the backstop
// for a dataset with no recorded freshness.
func DeferPublicationUntilStale(ctx context.Context, sched publicationScheduler, jobName, dataset string, client *redislib.Client, now time.Time) (bool, error) {
	if client == nil {
		return false, nil
	}

	due, err := rediscore.NextRefresh(ctx, client, dataset)
	if err != nil {
		logs.WarnCtx(ctx, "could not read dataset freshness, publishing anyway",
			"component", schedulerLogComponent, "job", jobName, "dataset", dataset, "error", err)
		return false, nil
	}
	if due.IsZero() || !due.After(now) {
		return false, nil
	}
	if sched == nil {
		return false, fmt.Errorf("defer %s until %s is stale: scheduler is required", jobName, dataset)
	}

	runAt := due.Add(freshnessScheduleMargin)
	if err := sched.ScheduleAt(ctx, jobName, runAt, nil); err != nil {
		return false, fmt.Errorf("defer %s until %s is stale: %w", jobName, dataset, err)
	}

	esimetrics.RecordPublicationSkipped(ctx, jobName, esimetrics.SkipFresh)
	logs.DebugCtx(ctx, "deferred publication until the data goes stale",
		"component", schedulerLogComponent,
		"job", jobName,
		"dataset", dataset,
		"stale_at_utc", due.UTC().Format(time.RFC3339),
		"runs_at_utc", runAt.UTC().Format(time.RFC3339))
	return true, nil
}
