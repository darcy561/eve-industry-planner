package esi

import (
	"context"
	"sync"
	"time"

	"eve-industry-planner/core/metrics/common"
	"eve-industry-planner/shared/logs"

	"github.com/redis/go-redis/v9"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/metric"
)

var registerOnce sync.Once

// Register registers observable gauges backed by Redis (same keys as worker ESI client).
// Callback runs on the OTel metric export interval (~15s).
func Register(rdb *redis.Client) {
	registerOnce.Do(func() {
		if rdb == nil {
			return
		}
		m := common.Meter()
		// Unit "1"; Prometheus names are core_esi_group_token_* (collector translation_strategy without unit suffix).
		gLimit, err := m.Float64ObservableGauge("core.esi.group.token_limit",
			metric.WithUnit("1"),
			metric.WithDescription("ESI error-limit token allowance for this group (X-Ratelimit-Limit style bucket)."),
		)
		if err != nil {
			logs.ErrorCtx(context.Background(), "core metrics esi: token_limit gauge", "error", err)
			return
		}
		gUsed, err := m.Float64ObservableGauge("core.esi.group.token_used",
			metric.WithUnit("1"),
			metric.WithDescription("Tokens consumed in the current rolling 15m window (from Redis)."),
		)
		if err != nil {
			logs.ErrorCtx(context.Background(), "core metrics esi: token_used gauge", "error", err)
			return
		}
		gRem, err := m.Float64ObservableGauge("core.esi.group.token_remaining",
			metric.WithUnit("1"),
			metric.WithDescription("Tokens remaining before exhaustion (limit − used when enforced)."),
		)
		if err != nil {
			logs.ErrorCtx(context.Background(), "core metrics esi: token_remaining gauge", "error", err)
			return
		}
		gInto, err := m.Float64ObservableGauge("core.esi.group.seconds_into_window",
			metric.WithUnit("s"),
			metric.WithDescription("Seconds since oldest consumption in the rolling 15m window (0–900s)."),
		)
		if err != nil {
			logs.ErrorCtx(context.Background(), "core metrics esi: seconds_into_window gauge", "error", err)
			return
		}
		gReset, err := m.Float64ObservableGauge("core.esi.group.seconds_until_reset",
			metric.WithUnit("s"),
			metric.WithDescription("When exhausted: seconds until oldest consumption ages out of the 15m window (next token). 0 when not waiting."),
		)
		if err != nil {
			logs.ErrorCtx(context.Background(), "core metrics esi: seconds_until_reset gauge", "error", err)
			return
		}

		_, err = m.RegisterCallback(func(ctx context.Context, o metric.Observer) error {
			cctx, cancel := context.WithTimeout(ctx, 8*time.Second)
			defer cancel()
			now := time.Now()
			groups, err := DiscoverGroups(cctx, rdb)
			if err != nil {
				logs.WarnCtx(cctx, "core metrics esi: discover ESI groups", "error", err)
				return nil
			}
			for _, g := range groups {
				st, err := ReadGroupState(cctx, rdb, now, g)
				if err != nil {
					logs.WarnCtx(cctx, "core metrics esi: read ESI group state", "group", g, "error", err)
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
			logs.ErrorCtx(context.Background(), "core metrics esi: register callback", "error", err)
		}
	})
}
