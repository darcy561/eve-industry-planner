package apimetrics

import (
	"context"
	"time"

	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/metric"
)

// DurationMilliseconds converts a duration to float milliseconds for latency histograms.
// Histogram bucket defaults in the OTel SDK match millisecond-scale values (0, 5, 10, 25, …).
func DurationMilliseconds(d time.Duration) float64 {
	return float64(d.Nanoseconds()) / 1e6
}

// floatHist records duration or size histograms.
type floatHist struct {
	h metric.Float64Histogram
}

func (f *floatHist) Observe(ctx context.Context, v float64) {
	f.h.Record(ctx, v)
}

type intCounter struct {
	c metric.Int64Counter
}

func (o *intCounter) Inc(ctx context.Context) {
	o.c.Add(ctx, 1)
}

func (o *intCounter) Add(ctx context.Context, delta float64) {
	o.c.Add(ctx, int64(delta))
}

type counterVec struct {
	c       metric.Int64Counter
	attrKey string
}

func (v *counterVec) WithLabelValues(val string) *labeledCounter {
	return &labeledCounter{c: v.c, kv: attribute.String(v.attrKey, val)}
}

type labeledCounter struct {
	c  metric.Int64Counter
	kv attribute.KeyValue
}

func (l *labeledCounter) Inc(ctx context.Context) {
	l.c.Add(ctx, 1, metric.WithAttributes(l.kv))
}
