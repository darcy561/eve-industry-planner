// Package esimetrics registers OpenTelemetry gauges for ESI Redis token buckets (core service).
package esimetrics

import (
	"context"
	"sync"
	"time"

	"eve-industry-planner/core/esilimits"
	"eve-industry-planner/shared/logs"

	"github.com/redis/go-redis/v9"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/metric"
)

var coreESIMeter = sync.OnceValue(func() metric.Meter {
	return otel.Meter("eve-industry-planner/coreesi")
})

var registerESIGroupOnce sync.Once

// RegisterESIGroupGauges registers observable gauges backed by Redis (same keys as worker ESI client).
// Callback runs on the OTel metric export interval (~15s).
func RegisterESIGroupGauges(rdb *redis.Client) {
	registerESIGroupOnce.Do(func() {
		if rdb == nil {
			return
		}
		m := coreESIMeter()
		// Unit "1" becomes *_ratio in Prometheus via the OTel collector (values are still token counts).
		gLimit, err := m.Float64ObservableGauge("core.esi.group.token_limit",
			metric.WithUnit("1"),
			metric.WithDescription("ESI error-limit token allowance for this group (X-Ratelimit-Limit style bucket)."),
		)
		if err != nil {
			logs.ErrorCtx(context.Background(), "esimetrics: token_limit gauge", "error", err)
			return
		}
		gUsed, err := m.Float64ObservableGauge("core.esi.group.token_used",
			metric.WithUnit("1"),
			metric.WithDescription("Tokens consumed in the current rolling 15m window (from Redis)."),
		)
		if err != nil {
			logs.ErrorCtx(context.Background(), "esimetrics: token_used gauge", "error", err)
			return
		}
		gRem, err := m.Float64ObservableGauge("core.esi.group.token_remaining",
			metric.WithUnit("1"),
			metric.WithDescription("Tokens remaining before exhaustion (limit − used when enforced)."),
		)
		if err != nil {
			logs.ErrorCtx(context.Background(), "esimetrics: token_remaining gauge", "error", err)
			return
		}
		gInto, err := m.Float64ObservableGauge("core.esi.group.seconds_into_window",
			metric.WithUnit("s"),
			metric.WithDescription("Seconds since oldest consumption in the rolling 15m window (0–900s)."),
		)
		if err != nil {
			logs.ErrorCtx(context.Background(), "esimetrics: seconds_into_window gauge", "error", err)
			return
		}
		gReset, err := m.Float64ObservableGauge("core.esi.group.seconds_until_reset",
			metric.WithUnit("s"),
			metric.WithDescription("When exhausted: seconds until oldest consumption ages out of the 15m window (next token). 0 when not waiting."),
		)
		if err != nil {
			logs.ErrorCtx(context.Background(), "esimetrics: seconds_until_reset gauge", "error", err)
			return
		}

		_, err = m.RegisterCallback(func(ctx context.Context, o metric.Observer) error {
			cctx, cancel := context.WithTimeout(ctx, 8*time.Second)
			defer cancel()
			now := time.Now()
			groups, err := esilimits.DiscoverGroups(cctx, rdb)
			if err != nil {
				logs.WarnCtx(cctx, "esimetrics: discover ESI groups", "error", err)
				return nil
			}
			for _, g := range groups {
				st, err := esilimits.ReadGroupState(cctx, rdb, now, g)
				if err != nil {
					logs.WarnCtx(cctx, "esimetrics: read ESI group state", "group", g, "error", err)
					continue
				}
				attr := metric.WithAttributes(attribute.String("group", g))
				limit := float64(st.TokenLimit)
				if limit < 0 {
					limit = 0
				}
				rem := st.TokenRemaining
				if rem < 0 {
					rem = 0
				}
				o.ObserveFloat64(gLimit, limit, attr)
				o.ObserveFloat64(gUsed, st.TokenUsed, attr)
				o.ObserveFloat64(gRem, rem, attr)
				o.ObserveFloat64(gInto, st.SecondsIntoWindow, attr)
				o.ObserveFloat64(gReset, st.SecondsUntilReset, attr)
			}
			return nil
		}, gLimit, gUsed, gRem, gInto, gReset)
		if err != nil {
			logs.ErrorCtx(context.Background(), "esimetrics: RegisterCallback ESI groups", "error", err)
		}
	})
}
