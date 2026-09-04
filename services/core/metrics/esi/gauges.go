package esi

import (
	"context"
	"sync"
	"time"

	"eve-industry-planner/core/metrics/common"
	"eve-industry-planner/shared/esiclient"
	"eve-industry-planner/shared/logs"

	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/metric"
)

var registerOnce sync.Once

// Register publishes what the fleet's ESI buckets hold. The worker reports its
// own queue depth and request outcomes through shared/esiclient; these are the
// shared bucket figures, which core can report even while no worker is running.
//
// The callback runs on the OTel export interval (~15s).
func Register(store *esiclient.Store) {
	registerOnce.Do(func() {
		if store == nil {
			return
		}
		m := common.Meter()

		gauge := func(name, unit, description string) (metric.Float64ObservableGauge, bool) {
			g, err := m.Float64ObservableGauge(name, metric.WithUnit(unit), metric.WithDescription(description))
			if err != nil {
				logs.ErrorCtx(context.Background(), "core metrics esi: gauge", "name", name, "error", err)
				return nil, false
			}
			return g, true
		}

		gLimit, ok := gauge("core.esi.bucket.token_limit", "1", "Token allowance ESI disclosed for this bucket.")
		if !ok {
			return
		}
		gUsed, ok := gauge("core.esi.bucket.token_used", "1", "Tokens spent inside the bucket's window.")
		if !ok {
			return
		}
		gRem, ok := gauge("core.esi.bucket.token_remaining", "1", "Tokens left before the bucket refuses.")
		if !ok {
			return
		}
		gFill, ok := gauge("core.esi.bucket.fill", "1", "Share of the allowance still available (0–1), which is what sets pacing.")
		if !ok {
			return
		}
		gOpen, ok := gauge("core.esi.bucket.seconds_until_open", "s", "Seconds until a refusing bucket admits again. 0 when it is not refusing.")
		if !ok {
			return
		}

		_, err := m.RegisterCallback(func(ctx context.Context, o metric.Observer) error {
			cctx, cancel := context.WithTimeout(ctx, 8*time.Second)
			defer cancel()

			rows, err := Read(cctx, store, time.Now())
			if err != nil {
				logs.WarnCtx(cctx, "core metrics esi: read bucket state", "error", err)
				return nil
			}
			for _, row := range rows {
				if !row.Known {
					continue
				}
				attr := metric.WithAttributes(
					attribute.String("group", row.Group),
					attribute.String("scope", row.Scope),
				)
				o.ObserveFloat64(gLimit, float64(row.TokenLimit), attr)
				o.ObserveFloat64(gUsed, float64(row.TokenUsed), attr)
				o.ObserveFloat64(gRem, float64(row.TokenRemaining), attr)
				o.ObserveFloat64(gFill, row.Fill, attr)
				o.ObserveFloat64(gOpen, row.SecondsUntilOpen, attr)
			}
			return nil
		}, gLimit, gUsed, gRem, gFill, gOpen)
		if err != nil {
			logs.ErrorCtx(context.Background(), "core metrics esi: register callback", "error", err)
		}
	})
}
