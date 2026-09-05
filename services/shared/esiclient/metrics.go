package esiclient

import (
	"context"
	"maps"
	"sync"
	"time"

	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/metric"

	"eve-industry-planner/shared/telemetry"
)

// Metrics for the ESI budget and the queues in front of it.
//
// Labels never carry a bucket key. An authenticated bucket is keyed per
// character, so that would grow a new time series per player — the group is the
// useful dimension and scope says whether the budget is the shared address one
// or a character's own.

var (
	metricsOnce sync.Once
	instruments *esiInstruments
)

type esiInstruments struct {
	requests   metric.Int64Counter
	tokens     metric.Int64Counter
	yields     metric.Int64Counter
	probes     metric.Int64Counter
	gates      metric.Int64Counter
	waitMs     metric.Float64Histogram
	durationMs metric.Float64Histogram
	wireBytes  metric.Int64Histogram
}

func esiMetrics() *esiInstruments {
	metricsOnce.Do(func() {
		m := telemetry.Meter("esiclient")
		instruments = &esiInstruments{
			requests: telemetry.Must(m.Int64Counter("esi.requests_total",
				metric.WithDescription("ESI requests that reached the network, by group, class and status class."))),
			tokens: telemetry.Must(m.Int64Counter("esi.tokens_spent_total",
				metric.WithDescription("Rate-limit tokens charged by ESI, by group and class. This is the budget actually consumed."))),
			yields: telemetry.Must(m.Int64Counter("esi.yields_total",
				metric.WithDescription("Calls turned away before reaching ESI, by group, class and reason (queued|decelerating|gated|error_limit|downtime|discovering)."))),
			probes: telemetry.Must(m.Int64Counter("esi.probes_total",
				metric.WithDescription("Discovery requests made to learn a bucket's allowance, by group."))),
			gates: telemetry.Must(m.Int64Counter("esi.gate_closures_total",
				metric.WithDescription("Times a bucket was gated by a Retry-After, by group. Each one stops every replica."))),
			waitMs: telemetry.Must(m.Float64Histogram("esi.queue_wait_milliseconds",
				metric.WithUnit("ms"),
				metric.WithDescription("How long a caller waited in process for a slot, by group and class."))),
			durationMs: telemetry.Must(m.Float64Histogram("esi.request_duration_milliseconds",
				metric.WithUnit("ms"),
				metric.WithDescription("Wall time of one ESI request, by group and status class."))),
			wireBytes: telemetry.Must(m.Int64Histogram("esi.request_wire_bytes",
				metric.WithUnit("By"),
				metric.WithDescription("Compressed bytes received from ESI, by group."))),
		}
	})
	return instruments
}

// Scope says whether a bucket is metered on this server's address or on a
// character. It never names the character: an id as a label is an unbounded
// metric dimension.
func Scope(b Bucket) string {
	if b.User == AnonymousUser {
		return "address"
	}
	return "character"
}

func bucketAttrs(b Bucket) []attribute.KeyValue {
	return []attribute.KeyValue{
		attribute.String("group", b.Group),
		attribute.String("scope", Scope(b)),
	}
}

func statusClass(status int) string {
	switch {
	case status == 0:
		return "none"
	case status < 300:
		return "2xx"
	case status < 400:
		return "3xx"
	case status == 429:
		return "429"
	case status < 500:
		return "4xx"
	default:
		return "5xx"
	}
}

func recordRequest(ctx context.Context, b Bucket, class Class, status, cost int, wire int64, took time.Duration) {
	attrs := append(bucketAttrs(b),
		attribute.String("class", class.String()),
		attribute.String("status", statusClass(status)),
	)
	set := metric.WithAttributes(attrs...)

	m := esiMetrics()
	m.requests.Add(ctx, 1, set)
	m.durationMs.Record(ctx, float64(took.Nanoseconds())/1e6, set)
	if wire > 0 {
		m.wireBytes.Record(ctx, wire, metric.WithAttributes(bucketAttrs(b)...))
	}
	if cost > 0 {
		m.tokens.Add(ctx, int64(cost), metric.WithAttributes(append(bucketAttrs(b),
			attribute.String("class", class.String()))...))
	}
}

func recordYield(ctx context.Context, b Bucket, class Class, kind Kind) {
	esiMetrics().yields.Add(ctx, 1, metric.WithAttributes(append(bucketAttrs(b),
		attribute.String("class", class.String()),
		attribute.String("reason", kind.String()),
	)...))
}

func recordWait(ctx context.Context, b Bucket, class Class, waited time.Duration) {
	esiMetrics().waitMs.Record(ctx, float64(waited.Nanoseconds())/1e6,
		metric.WithAttributes(append(bucketAttrs(b), attribute.String("class", class.String()))...))
}

func recordProbe(ctx context.Context, b Bucket) {
	esiMetrics().probes.Add(ctx, 1, metric.WithAttributes(bucketAttrs(b)...))
}

func recordGateClosure(ctx context.Context, b Bucket) {
	esiMetrics().gates.Add(ctx, 1, metric.WithAttributes(bucketAttrs(b)...))
}

// Snapshot is one bucket as it stands: what ESI allows, what is spent, and how
// many callers are queued for it here.
type Snapshot struct {
	Bucket  Bucket
	State   BucketState
	Waiting int
	Held    int
}

// Fill is the share of the allowance still available, which is what decides
// pacing. Zero when the allowance is not yet known.
func (s Snapshot) Fill() float64 {
	if s.State.Limit <= 0 {
		return 0
	}
	return max(float64(s.State.Limit-s.State.Spent)/float64(s.State.Limit), 0)
}

// Snapshot reports every bucket this dispatcher has touched, for gauges and for
// the operator CLI.
func (d *Dispatcher) Snapshot(ctx context.Context) []Snapshot {
	d.mu.Lock()
	buckets := make([]Bucket, 0, len(d.seen))
	for _, b := range d.seen {
		buckets = append(buckets, b)
	}
	queues := make(map[string]*bucketQueue, len(d.queues))
	maps.Copy(queues, d.queues)
	d.mu.Unlock()

	out := make([]Snapshot, 0, len(buckets))
	for _, b := range buckets {
		state, err := d.store.State(ctx, b)
		if err != nil {
			continue
		}

		snapshot := Snapshot{Bucket: b, State: state}
		if q, ok := queues[b.Key()]; ok {
			q.mu.Lock()
			// waiting is keyed by class, so its length is the number of classes
			// with callers, not the number of callers.
			for _, byClass := range q.waiting {
				snapshot.Waiting += len(byClass)
			}
			snapshot.Held = len(q.held)
			q.mu.Unlock()
		}
		out = append(out, snapshot)
	}
	return out
}

// RegisterMetrics starts the observable gauges for this process's queues. The
// callback runs on the exporter's interval, so Grafana sees the depth build and
// drain rather than only the events either side of it.
//
// Bucket state is deliberately not reported here. A bucket belongs to the fleet
// rather than to one process: every replica reads the same figures from Redis,
// so reporting them per replica emits identical series that a dashboard can
// wrongly sum. Queue depth is the only part of this a replica knows alone.
//
// Returns a function that stops observing.
func RegisterMetrics(d *Dispatcher) (func() error, error) {
	m := telemetry.Meter("esiclient")

	waiting, err := m.Int64ObservableGauge("esi.queue.waiting",
		metric.WithDescription("Callers parked in process for a slot on this bucket."))
	if err != nil {
		return nil, err
	}
	held, err := m.Int64ObservableGauge("esi.queue.slots_held",
		metric.WithDescription("Slots reserved from the shared clock and not yet handed to a caller."))
	if err != nil {
		return nil, err
	}

	registration, err := m.RegisterCallback(func(_ context.Context, o metric.Observer) error {
		for bucket, depth := range d.queueDepth() {
			attrs := metric.WithAttributes(bucketAttrs(bucket)...)
			o.ObserveInt64(waiting, int64(depth.Waiting), attrs)
			o.ObserveInt64(held, int64(depth.Held), attrs)
		}
		return nil
	}, waiting, held)
	if err != nil {
		return nil, err
	}
	return registration.Unregister, nil
}

func boolToInt64(b bool) int64 {
	if b {
		return 1
	}
	return 0
}
