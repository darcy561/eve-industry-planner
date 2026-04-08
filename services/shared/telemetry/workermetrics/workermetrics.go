// Package workermetrics registers OpenTelemetry metrics for the worker (Asynq tasks).
package workermetrics

import (
	"context"
	"sync"
	"time"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/metric"
)

var workerMeter = sync.OnceValue(func() metric.Meter {
	return otel.Meter("eve-industry-planner/worker")
})

var (
	initOnce sync.Once
	holder   *asynqTaskMetrics
)

type asynqTaskMetrics struct {
	durationMs metric.Float64Histogram
	tasksTotal metric.Int64Counter
}

func mustHist(h metric.Float64Histogram, err error) metric.Float64Histogram {
	if err != nil {
		panic("workermetrics: Float64Histogram: " + err.Error())
	}
	return h
}

func mustCounter(c metric.Int64Counter, err error) metric.Int64Counter {
	if err != nil {
		panic("workermetrics: Int64Counter: " + err.Error())
	}
	return c
}

func metrics() *asynqTaskMetrics {
	initOnce.Do(func() {
		m := workerMeter()
		holder = &asynqTaskMetrics{
			// Values are recorded and exported as milliseconds (nanos/1e6); Grafana uses histogram _sum/_count/_bucket without extra scaling.
			durationMs: mustHist(m.Float64Histogram("worker.asynq.task.duration_milliseconds",
				metric.WithUnit("ms"),
				metric.WithDescription("Wall time to execute one Asynq task handler (milliseconds)"),
			)),
			tasksTotal: mustCounter(m.Int64Counter("worker.asynq.tasks_total",
				metric.WithDescription("Asynq task completions by task type and outcome (success|failure). Rate-limit re-queues are not recorded."),
			)),
		}
	})
	return holder
}

// RecordAsynqTask records duration and count for a terminal handler result (success or failure).
// Retryable rate-limit deferrals are not recorded — those attempts are expected to repeat until success or real error.
func RecordAsynqTask(ctx context.Context, taskType, outcome string, d time.Duration) {
	if ctx == nil {
		ctx = context.Background()
	}
	ms := float64(d.Nanoseconds()) / 1e6
	attrs := []attribute.KeyValue{
		attribute.String("task_type", taskType),
		attribute.String("outcome", outcome),
	}
	mm := metrics()
	mm.durationMs.Record(ctx, ms, metric.WithAttributes(attrs...))
	mm.tasksTotal.Add(ctx, 1, metric.WithAttributes(attrs...))
}

