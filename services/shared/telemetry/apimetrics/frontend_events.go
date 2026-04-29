package apimetrics

import (
	"context"
	"sync"
	"time"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/metric"
)

const (
	// FrontendAudienceAuthenticated is recorded when a valid internal JWT Bearer is present.
	FrontendAudienceAuthenticated = "authenticated"
	// FrontendAudienceAnonymous is recorded when there is no Bearer or the JWT is invalid/expired.
	FrontendAudienceAnonymous = "anonymous"
)

var webMeter = sync.OnceValue(func() metric.Meter {
	return otel.Meter("eve-industry-planner/web")
})

// WebFrontendEventsMetrics holds OTel counters for browser-originated product events (no per-user labels).
type WebFrontendEventsMetrics struct {
	requests      metric.Float64Histogram
	requestsCount metric.Int64Counter
	successes     metric.Int64Counter
	events        metric.Int64Counter
	jobCreates    metric.Int64Counter
	itemTreeViews metric.Int64Counter
	invalidEvents metric.Int64Counter
}

var (
	webFrontendEventsOnce   sync.Once
	webFrontendEventsHolder *WebFrontendEventsMetrics
)

// GetWebFrontendEvents returns metrics for POST /api/v1/analytics/events.
func GetWebFrontendEvents() *WebFrontendEventsMetrics {
	webFrontendEventsOnce.Do(func() {
		m := webMeter()
		webFrontendEventsHolder = &WebFrontendEventsMetrics{
			requests: mustHist(m.Float64Histogram("web.frontend_analytics.duration_milliseconds",
				metric.WithUnit("ms"),
				metric.WithDescription("Latency of POST /api/v1/analytics/events requests in milliseconds"),
			)),
			requestsCount: mustCounter(m.Int64Counter("web.frontend_analytics.requests_total",
				metric.WithDescription("Total POST /api/v1/analytics/events requests"),
			)),
			successes: mustCounter(m.Int64Counter("web.frontend_analytics.successes_total",
				metric.WithDescription("Successful POST /api/v1/analytics/events requests"),
			)),
			events: mustCounter(m.Int64Counter("web.frontend_events_total",
				metric.WithDescription("Product events submitted from the web app (allowlisted event keys; audience is authenticated vs anonymous only)"),
			)),
			jobCreates: mustCounter(m.Int64Counter("web.frontend_job_creates_total",
				metric.WithDescription("Jobs created from the web app by output item type ID (EVE type_id); audience is authenticated vs anonymous only"),
			)),
			itemTreeViews: mustCounter(m.Int64Counter("web.frontend_item_tree_item_views_total",
				metric.WithDescription("Item tree item views from the web app by item type ID (EVE type_id); audience is authenticated vs anonymous only"),
			)),
			invalidEvents: mustCounter(m.Int64Counter("web.frontend_analytics_invalid_total",
				metric.WithDescription("Rejected analytics event requests by reason"),
			)),
		}
	})
	return webFrontendEventsHolder
}

// RecordItemTreeViews increments web.frontend_item_tree_item_views_total once per (audience, type_id) with n views.
func (w *WebFrontendEventsMetrics) RecordItemTreeViews(ctx context.Context, audience string, byType map[int64]int64) {
	for typeID, n := range byType {
		if n < 1 {
			continue
		}
		if n > MaxFrontendJobCreatesPerType {
			n = MaxFrontendJobCreatesPerType
		}
		w.itemTreeViews.Add(ctx, n,
			metric.WithAttributes(
				attribute.String("audience", audience),
				attribute.Int64("type_id", typeID),
			),
		)
	}
}

// RecordRequest observes one analytics request duration and increments request count.
func (w *WebFrontendEventsMetrics) RecordRequest(ctx context.Context, duration time.Duration) {
	w.RecordRequestMilliseconds(ctx, duration.Seconds()*1000.0)
}

// RecordRequestMilliseconds observes analytics request duration in milliseconds and increments request count.
func (w *WebFrontendEventsMetrics) RecordRequestMilliseconds(ctx context.Context, ms float64) {
	w.requests.Record(ctx, ms)
	w.requestsCount.Add(ctx, 1)
}

// RecordSuccess increments successful analytics batch requests.
func (w *WebFrontendEventsMetrics) RecordSuccess(ctx context.Context) {
	w.successes.Add(ctx, 1)
}

const maxFrontendEventCount int64 = 1000

// MaxFrontendJobCreateTypeID is the upper bound for EVE type_id in job-create analytics payloads.
const MaxFrontendJobCreateTypeID int64 = 2147483647

// MaxFrontendJobCreatesPerType caps jobs per type_id in a single analytics request.
const MaxFrontendJobCreatesPerType int64 = 100000

// RecordEvent increments web.frontend_events_total for an allowlisted event (n is clamped to [1, maxFrontendEventCount]).
func (w *WebFrontendEventsMetrics) RecordEvent(ctx context.Context, eventKey, audience string, n int64) {
	if n < 1 {
		n = 1
	}
	if n > maxFrontendEventCount {
		n = maxFrontendEventCount
	}
	w.events.Add(ctx, n,
		metric.WithAttributes(
			attribute.String("event", eventKey),
			attribute.String("audience", audience),
		),
	)
}

// RecordInvalid increments web.frontend_analytics_invalid_total (e.g. unknown_event, bad_json).
func (w *WebFrontendEventsMetrics) RecordInvalid(ctx context.Context, reason string) {
	w.invalidEvents.Add(ctx, 1, metric.WithAttributes(attribute.String("reason", reason)))
}

// RecordJobCreates increments web.frontend_job_creates_total once per (audience, type_id) with n jobs.
func (w *WebFrontendEventsMetrics) RecordJobCreates(ctx context.Context, audience string, byType map[int64]int64) {
	for typeID, n := range byType {
		if n < 1 {
			continue
		}
		if n > MaxFrontendJobCreatesPerType {
			n = MaxFrontendJobCreatesPerType
		}
		w.jobCreates.Add(ctx, n,
			metric.WithAttributes(
				attribute.String("audience", audience),
				attribute.Int64("type_id", typeID),
			),
		)
	}
}
