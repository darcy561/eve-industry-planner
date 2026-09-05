package esi

import (
	"context"
	"sync"

	"eve-industry-planner/core/metrics/common"
	"eve-industry-planner/shared/logs"

	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/metric"
)

// Reasons a scheduled refresh was not published.
const (
	SkipDowntime = "downtime"
	SkipFresh    = "still_fresh"
	SkipBudget   = "budget"
)

var (
	skippedOnce sync.Once
	skipped     metric.Int64Counter
)

// RecordPublicationSkipped counts a refresh the scheduler decided not to
// publish.
//
// These decisions are made before any request, so the limiter never sees them
// and its own yield counters cannot account for them. Without this, a fall in
// ESI traffic is indistinguishable from work having quietly stopped.
func RecordPublicationSkipped(ctx context.Context, job, reason string) {
	skippedOnce.Do(func() {
		counter, err := common.Meter().Int64Counter("core.esi.publication_skipped",
			metric.WithUnit("1"),
			metric.WithDescription("Scheduled ESI refreshes not published, by reason."),
		)
		if err != nil {
			logs.ErrorCtx(ctx, "core metrics esi: publication_skipped counter", "error", err)
			return
		}
		skipped = counter
	})
	if skipped == nil {
		return
	}
	skipped.Add(ctx, 1, metric.WithAttributes(
		attribute.String("job", job),
		attribute.String("reason", reason),
	))
}
