package apimetrics

import (
	"context"
	"fmt"
	"sync"
	"time"

	"eve-industry-planner/shared/logs"

	"github.com/redis/go-redis/v9"
	"go.opentelemetry.io/otel/metric"

	"eve-industry-planner/shared/telemetry"
)

const (
	authSessionDistinctHLLKeyPrefix = "apimetrics:auth_sessions_distinct:hll:"
	authSessionDistinctMergeTmpKey  = "apimetrics:auth_sessions_distinct:merge_tmp"
)

func authSessionDistinctHourRedisKey(t time.Time) string {
	u := t.UTC().Truncate(time.Hour)
	return fmt.Sprintf("%s%s", authSessionDistinctHLLKeyPrefix, u.Format("2006010215"))
}

// RecordAuthSessionDistinctAccount records account activity for distinct-account session metrics.
func RecordAuthSessionDistinctAccount(ctx context.Context, rdb *redis.Client, accountID string) {
	if rdb == nil || accountID == "" {
		return
	}
	key := authSessionDistinctHourRedisKey(time.Now())
	if err := rdb.PFAdd(ctx, key, accountID).Err(); err != nil {
		logs.WarnCtx(ctx, "apimetrics: PFAdd auth sessions distinct", "error", err)
		return
	}
	_ = rdb.Expire(ctx, key, 35*24*time.Hour).Err()
}

func distinctAuthSessionMergedHours(ctx context.Context, rdb *redis.Client, numHours int) (uint64, error) {
	if rdb == nil || numHours <= 0 {
		return 0, nil
	}
	now := time.Now().UTC().Truncate(time.Hour)
	keys := make([]string, 0, numHours)
	for i := range numHours {
		t := now.Add(-time.Duration(i) * time.Hour)
		keys = append(keys, authSessionDistinctHourRedisKey(t))
	}
	if err := rdb.PFMerge(ctx, authSessionDistinctMergeTmpKey, keys...).Err(); err != nil {
		return 0, err
	}
	defer func() { _ = rdb.Del(ctx, authSessionDistinctMergeTmpKey).Err() }()
	cnt, err := rdb.PFCount(ctx, authSessionDistinctMergeTmpKey).Result()
	return uint64(cnt), err
}

var registerAuthSessionDistinctOnce sync.Once

// RegisterAuthSessionDistinctGauges registers rolling-window distinct-account gauges.
func RegisterAuthSessionDistinctGauges(rdb *redis.Client) {
	registerAuthSessionDistinctOnce.Do(func() {
		if rdb == nil {
			return
		}
		m := telemetry.Meter("api")
		g24, err := m.Float64ObservableGauge("api.auth_sessions.distinct_accounts_last_24h",
			metric.WithUnit("{accounts}"),
			metric.WithDescription("Approximate distinct account IDs that started auth sessions in the rolling prior 24 UTC hours (Redis HLL merge)."),
		)
		if err != nil {
			logs.ErrorCtx(context.Background(), "apimetrics: Float64ObservableGauge auth_sessions 24h", "error", err)
			return
		}
		g168, err := m.Float64ObservableGauge("api.auth_sessions.distinct_accounts_last_168h",
			metric.WithUnit("{accounts}"),
			metric.WithDescription("Approximate distinct account IDs that started auth sessions in the rolling prior 168 UTC hours (7d; Redis HLL merge)."),
		)
		if err != nil {
			logs.ErrorCtx(context.Background(), "apimetrics: Float64ObservableGauge auth_sessions 168h", "error", err)
			return
		}
		g720, err := m.Float64ObservableGauge("api.auth_sessions.distinct_accounts_last_720h",
			metric.WithUnit("{accounts}"),
			metric.WithDescription("Approximate distinct account IDs that started auth sessions in the rolling prior 720 UTC hours (30d; Redis HLL merge)."),
		)
		if err != nil {
			logs.ErrorCtx(context.Background(), "apimetrics: Float64ObservableGauge auth_sessions 720h", "error", err)
			return
		}
		_, err = m.RegisterCallback(func(ctx context.Context, o metric.Observer) error {
			v24, err := distinctAuthSessionMergedHours(ctx, rdb, 24)
			if err != nil {
				logs.WarnCtx(ctx, "apimetrics: distinct auth sessions 24h merge", "error", err)
				v24 = 0
			}
			o.ObserveFloat64(g24, float64(v24))

			v168, err := distinctAuthSessionMergedHours(ctx, rdb, 168)
			if err != nil {
				logs.WarnCtx(ctx, "apimetrics: distinct auth sessions 168h merge", "error", err)
				v168 = 0
			}
			o.ObserveFloat64(g168, float64(v168))

			v720, err := distinctAuthSessionMergedHours(ctx, rdb, 720)
			if err != nil {
				logs.WarnCtx(ctx, "apimetrics: distinct auth sessions 720h merge", "error", err)
				v720 = 0
			}
			o.ObserveFloat64(g720, float64(v720))
			return nil
		}, g24, g168, g720)
		if err != nil {
			logs.ErrorCtx(context.Background(), "apimetrics: RegisterCallback auth_sessions distinct gauges", "error", err)
		}
	})
}
