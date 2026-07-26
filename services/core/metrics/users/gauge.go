package users

import (
	"context"
	"sync"
	"sync/atomic"
	"time"

	"eve-industry-planner/core/metrics/common"
	mongocore "eve-industry-planner/shared/core/mongo"
	"eve-industry-planner/shared/logs"

	gomongo "go.mongodb.org/mongo-driver/mongo"
	"go.opentelemetry.io/otel/metric"
)

var registerOnce sync.Once

const usersCountRefreshInterval = 1 * time.Hour

// Register registers an observable gauge for total users in MongoDB.
// Callback runs on the OTel metric export interval (~15s).
func Register(mongoClient *gomongo.Client) {
	registerOnce.Do(func() {
		if mongoClient == nil {
			return
		}
		m := common.Meter()
		var cachedTotal atomic.Int64
		gUsers, err := m.Int64ObservableGauge("core.users.total",
			metric.WithUnit("{users}"),
			metric.WithDescription("Total users in MongoDB users collection (historical total), refreshed periodically in background."),
		)
		if err != nil {
			logs.ErrorCtx(context.Background(), "core metrics users: users_total gauge", "error", err)
			return
		}

		refreshCount := func() {
			ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
			defer cancel()
			coll := mongoClient.Database(mongocore.DatabaseName).Collection(mongocore.CollectionUsers)
			total, err := coll.CountDocuments(ctx, map[string]any{})
			if err != nil {
				logs.WarnCtx(ctx, "core metrics users: count users", "error", err)
				return
			}
			cachedTotal.Store(total)
		}

		// Prime once at startup, then refresh on a slower cadence than OTel export/scrape.
		refreshCount()
		go func() {
			t := time.NewTicker(usersCountRefreshInterval)
			defer t.Stop()
			for range t.C {
				refreshCount()
			}
		}()

		_, err = m.RegisterCallback(func(ctx context.Context, o metric.Observer) error {
			o.ObserveInt64(gUsers, cachedTotal.Load())
			return nil
		}, gUsers)
		if err != nil {
			logs.ErrorCtx(context.Background(), "core metrics users: register callback", "error", err)
		}
	})
}
