package apimetrics

import (
	"context"
	"fmt"
	"sync"
	"time"

	"eve-industry-planner/shared/logs"

	"github.com/redis/go-redis/v9"
	"go.opentelemetry.io/otel/metric"
)

const (
	ssoDistinctHLLKeyPrefix = "apimetrics:sso_refresh_distinct:hll:"
	ssoDistinctMergeTmpKey  = "apimetrics:sso_refresh_distinct:merge_tmp"
)

func ssoDistinctHourRedisKey(t time.Time) string {
	u := t.UTC().Truncate(time.Hour)
	return fmt.Sprintf("%s%s", ssoDistinctHLLKeyPrefix, u.Format("2006010215"))
}

// RecordSSORefreshDistinctCharacter adds the character owner hash to the current UTC hour bucket
// (Redis HyperLogLog). Used to estimate distinct characters that successfully refreshed SSO tokens
// without exposing per-character Prometheus labels.
func RecordSSORefreshDistinctCharacter(ctx context.Context, rdb *redis.Client, characterHash string) {
	if rdb == nil || characterHash == "" {
		return
	}
	key := ssoDistinctHourRedisKey(time.Now())
	if err := rdb.PFAdd(ctx, key, characterHash).Err(); err != nil {
		logs.WarnCtx(ctx, "apimetrics: PFAdd sso refresh distinct", "error", err)
		return
	}
	_ = rdb.Expire(ctx, key, 8*24*time.Hour).Err()
}

func distinctSSORefreshMergedHours(ctx context.Context, rdb *redis.Client, numHours int) (uint64, error) {
	if rdb == nil || numHours <= 0 {
		return 0, nil
	}
	now := time.Now().UTC().Truncate(time.Hour)
	keys := make([]string, 0, numHours)
	for i := range numHours {
		t := now.Add(-time.Duration(i) * time.Hour)
		keys = append(keys, ssoDistinctHourRedisKey(t))
	}
	if err := rdb.PFMerge(ctx, ssoDistinctMergeTmpKey, keys...).Err(); err != nil {
		return 0, err
	}
	defer func() { _ = rdb.Del(ctx, ssoDistinctMergeTmpKey).Err() }()
	cnt, err := rdb.PFCount(ctx, ssoDistinctMergeTmpKey).Result()
	return uint64(cnt), err
}

var registerSSORefreshDistinctOnce sync.Once

// RegisterSSORefreshDistinctGauges registers observable gauges that estimate distinct character hashes
// (OAuth owner) that completed SSO refresh in rolling UTC windows, using hourly Redis HyperLogLogs.
// Values are approximate (~0.81% error typical for HLL). Windows are fixed (24h / 7d), not Grafana's picker.
func RegisterSSORefreshDistinctGauges(rdb *redis.Client) {
	registerSSORefreshDistinctOnce.Do(func() {
		if rdb == nil {
			return
		}
		m := apiMeter()
		g24, err := m.Float64ObservableGauge("api.eve_sso_token_refresh.distinct_characters_last_24h",
			metric.WithUnit("{characters}"),
			metric.WithDescription("Approximate distinct character hashes with ≥1 successful EVE OAuth token refresh in the rolling prior 24 UTC hours (Redis HLL merge)."),
		)
		if err != nil {
			logs.ErrorCtx(context.Background(), "apimetrics: Float64ObservableGauge sso_refresh 24h", "error", err)
			return
		}
		g168, err := m.Float64ObservableGauge("api.eve_sso_token_refresh.distinct_characters_last_168h",
			metric.WithUnit("{characters}"),
			metric.WithDescription("Approximate distinct character hashes with ≥1 successful EVE OAuth token refresh in the rolling prior 168 UTC hours (7d; Redis HLL merge)."),
		)
		if err != nil {
			logs.ErrorCtx(context.Background(), "apimetrics: Float64ObservableGauge sso_refresh 168h", "error", err)
			return
		}
		_, err = m.RegisterCallback(func(ctx context.Context, o metric.Observer) error {
			v24, err := distinctSSORefreshMergedHours(ctx, rdb, 24)
			if err != nil {
				logs.WarnCtx(ctx, "apimetrics: distinct SSO refresh 24h merge", "error", err)
				v24 = 0
			}
			o.ObserveFloat64(g24, float64(v24))
			v168, err := distinctSSORefreshMergedHours(ctx, rdb, 168)
			if err != nil {
				logs.WarnCtx(ctx, "apimetrics: distinct SSO refresh 168h merge", "error", err)
				v168 = 0
			}
			o.ObserveFloat64(g168, float64(v168))
			return nil
		}, g24, g168)
		if err != nil {
			logs.ErrorCtx(context.Background(), "apimetrics: RegisterCallback sso_refresh distinct gauges", "error", err)
		}
	})
}
