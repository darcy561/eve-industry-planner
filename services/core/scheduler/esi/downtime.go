package esi

import (
	"context"
	"sync"
	"time"

	"eve-industry-planner/shared/logs"
)

const (
	eveDowntimeStartHourUTC = 11
	eveDowntimeStartMinUTC  = 0
	eveDowntimeEndHourUTC   = 11
	eveDowntimeEndMinUTC    = 15
)

type downtimeContextKey string

const deferredFromDowntimeContextKey downtimeContextKey = "deferred_from_downtime"

var deferredTaskMu sync.Mutex
var deferredTaskUntil = make(map[string]time.Time)

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

func withDeferredFromDowntime(ctx context.Context) context.Context {
	return context.WithValue(ctx, deferredFromDowntimeContextKey, true)
}

func wasDeferredFromDowntime(ctx context.Context) bool {
	deferred, ok := ctx.Value(deferredFromDowntimeContextKey).(bool)
	return ok && deferred
}

func computeRunsPer4Hours(now time.Time, deferred bool) float64 {
	const baselineRunsPer4Hours = 48.0
	const downtimeAwareRunsPer4Hours = 45.0
	if deferred {
		return downtimeAwareRunsPer4Hours
	}
	if inDowntime, _ := isInEVEDowntime(now); inDowntime {
		return downtimeAwareRunsPer4Hours
	}
	return baselineRunsPer4Hours
}

// DeferTaskPublicationUntilAfterDowntime skips publication during daily downtime and runs publish after the window.
func DeferTaskPublicationUntilAfterDowntime(ctx context.Context, taskName string, subject string, publish func(context.Context) error) bool {
	return deferTaskPublicationUntilAfterDowntime(ctx, taskName, subject, publish)
}

func deferTaskPublicationUntilAfterDowntime(ctx context.Context, taskName string, subject string, publish func(context.Context) error) bool {
	now := time.Now()
	inDowntime, downtimeEnd := isInEVEDowntime(now)
	if !inDowntime {
		return false
	}

	deferKey := taskName + "|" + subject
	deferredTaskMu.Lock()
	existingEnd, exists := deferredTaskUntil[deferKey]
	if exists && !existingEnd.Before(downtimeEnd) {
		deferredTaskMu.Unlock()
		logs.DebugCtx(ctx, "ESI task publication already deferred for current downtime window",
			"component", schedulerLogComponent,
			"task", taskName,
			"subject", subject,
			"downtime_end_utc", downtimeEnd.Format(time.RFC3339))
		return true
	}
	deferredTaskUntil[deferKey] = downtimeEnd
	deferredTaskMu.Unlock()

	waitUntil := downtimeEnd.Add(2 * time.Second)
	waitDuration := time.Until(waitUntil)
	if waitDuration < 0 {
		waitDuration = 0
	}

	logs.InfoCtx(ctx, "deferring ESI task publication until after EVE downtime",
		"component", schedulerLogComponent,
		"task", taskName,
		"subject", subject,
		"downtime_end_utc", downtimeEnd.Format(time.RFC3339),
		"defer_seconds", int(waitDuration.Seconds()))

	go func(taskName string, subject string, deferKey string, expectedEnd time.Time, waitDuration time.Duration) {
		timer := time.NewTimer(waitDuration)
		defer timer.Stop()
		<-timer.C

		deferredCtx := withDeferredFromDowntime(context.Background())
		if err := publish(deferredCtx); err != nil {
			logs.ErrorCtx(deferredCtx, "failed deferred ESI task publication after downtime",
				"component", schedulerLogComponent,
				"task", taskName,
				"subject", subject,
				"downtime_end_utc", expectedEnd.Format(time.RFC3339),
				"error", err)
		} else {
			logs.InfoCtx(deferredCtx, "deferred ESI task publication completed after downtime",
				"component", schedulerLogComponent,
				"task", taskName,
				"subject", subject,
				"downtime_end_utc", expectedEnd.Format(time.RFC3339))
		}

		deferredTaskMu.Lock()
		delete(deferredTaskUntil, deferKey)
		deferredTaskMu.Unlock()
	}(taskName, subject, deferKey, downtimeEnd, waitDuration)

	return true
}
