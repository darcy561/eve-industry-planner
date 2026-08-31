package esi

import (
	"context"
	"fmt"
	"time"

	"eve-industry-planner/shared/logs"
)

const (
	eveDowntimeStartHourUTC = 11
	eveDowntimeStartMinUTC  = 0
	eveDowntimeEndHourUTC   = 11
	eveDowntimeEndMinUTC    = 15
	// downtimeScheduleMargin keeps a deferred run clear of the window's closing edge, so a
	// schedule firing on the server's clock does not land while ESI is still refusing requests.
	downtimeScheduleMargin = 2 * time.Second
)

// publicationScheduler defers a run to a later time under an id that identifies it.
// Scheduling again under one id replaces what was there, so a cron job's name is
// enough to keep one deferral per job.
type publicationScheduler interface {
	ScheduleAt(ctx context.Context, id string, at time.Time, payload []byte) error
}

// IsInEVEDowntime reports whether now falls in the daily EVE maintenance window (UTC).
func IsInEVEDowntime(now time.Time) (bool, time.Time) {
	return isInEVEDowntime(now)
}

func isInEVEDowntime(now time.Time) (bool, time.Time) {
	utc := now.UTC()
	start := time.Date(utc.Year(), utc.Month(), utc.Day(), eveDowntimeStartHourUTC, eveDowntimeStartMinUTC, 0, 0, time.UTC)
	end := time.Date(utc.Year(), utc.Month(), utc.Day(), eveDowntimeEndHourUTC, eveDowntimeEndMinUTC, 0, 0, time.UTC)

	if !utc.Before(start) && utc.Before(end) {
		return true, end
	}
	return false, time.Time{}
}

// DeferPublicationUntilAfterDowntime schedules jobName to run once the current EVE downtime
// window has passed, and reports whether it did. Outside the window it reports false and the
// caller publishes as normal.
//
// The schedule delivers to the schedule runner, which runs the handler registered under
// jobName — the same handler the cron fires — so the deferred run repeats this check and
// publishes, downtime now being over.
//
// A deferral that cannot be scheduled is an error rather than a publication during downtime;
// the next cron tick retries it.
func DeferPublicationUntilAfterDowntime(ctx context.Context, sched publicationScheduler, jobName string, now time.Time) (bool, error) {
	inDowntime, downtimeEnd := isInEVEDowntime(now)
	if !inDowntime {
		return false, nil
	}
	if sched == nil {
		return false, fmt.Errorf("defer %s until after downtime: scheduler is required", jobName)
	}

	runAt := downtimeEnd.Add(downtimeScheduleMargin)
	if err := sched.ScheduleAt(ctx, jobName, runAt, nil); err != nil {
		return false, fmt.Errorf("defer %s until after downtime: %w", jobName, err)
	}

	logs.InfoCtx(ctx, "deferred publication until after EVE downtime",
		"component", schedulerLogComponent,
		"job", jobName,
		"downtime_end_utc", downtimeEnd.Format(time.RFC3339),
		"runs_at_utc", runAt.UTC().Format(time.RFC3339))
	return true, nil
}
