package maintenance

import (
	"context"
	"encoding/json"
	"math"
	"time"

	"eve-industry-planner/core/scheduler/contract"
	schedesi "eve-industry-planner/core/scheduler/esi"
	mongocore "eve-industry-planner/shared/core/mongo"
	"eve-industry-planner/shared/core/mongo/indexing"
	natscore "eve-industry-planner/shared/core/nats"
	"eve-industry-planner/shared/logs"
	taskscore "eve-industry-planner/shared/tasks"

	redislib "github.com/redis/go-redis/v9"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo/options"
)

const (
	cronCloudStoredEsiRefreshName     = "cron.cloudStoredEsiRefreshMaintenance"
	cronCloudStoredEsiRefreshSchedule = "*/10 * * * *" // every 10 minutes
	cloudEsiRefreshBookmarkKey        = "scheduler:maintenance:cloud_esi_refresh_user_bookmark"
	defaultRotateAfterLoginDays       = 25
	defaultAbandonAfterLoginMonths    = 6
	// Fallback when CountDocuments fails or returns zero.
	maxCloudEsiAccountsFallback = 25
	maxCloudEsiAccountsAbsolute = 200
	minCloudEsiAccountsBatch    = 5
	microBatchInterval          = 15 * time.Second
	microBatchPublishWindow     = 9*time.Minute + 45*time.Second
	// Target clearing the eligible cohort about once per day at steady state (144 runs/day at 10 min).
	runsPerDayCloudEsi = 144.0
)

// ScheduleCloudStoredEsiRefreshMaintenance publishes per-account tasks to rotate encrypted cloud ESI
// refresh tokens. Eligible users: cloud mode, non-empty refreshTokens, last login in [now−6mo, now−25d).
// Uses dynamic batch sizing, EVE downtime deferral (like industry indexes), downtime publish caps
// (like market prices), and micro-batch staggering across the cron window.
func ScheduleCloudStoredEsiRefreshMaintenance(deps contract.Dependencies, sched contract.Scheduler) (func(), error) {
	task := taskscore.CloudStoredEsiRefreshMaintenance
	sched.RegisterHandler(cronCloudStoredEsiRefreshName, func(ctx context.Context, data json.RawMessage) error {
		_ = data
		publish := func(pctx context.Context) error {
			return publishCloudEsiRefreshMaintenanceBatch(pctx, deps, task)
		}
		if schedesi.DeferTaskPublicationUntilAfterDowntime(ctx, cronCloudStoredEsiRefreshName, task.Subject, publish) {
			return nil
		}
		return publish(ctx)
	})
	if err := sched.ScheduleCronJob(cronCloudStoredEsiRefreshSchedule, cronCloudStoredEsiRefreshName); err != nil {
		return nil, err
	}
	return func() {}, nil
}

func publishCloudEsiRefreshMaintenanceBatch(ctx context.Context, deps contract.Dependencies, task taskscore.Task) error {
	if deps.Mongo == nil {
		logs.ErrorCtx(ctx, "cloud esi refresh maintenance: mongo client is nil", "component", schedulerLogComponent)
		return nil
	}
	now := time.Now().UTC()
	sixMoAgo := now.AddDate(0, -defaultAbandonAfterLoginMonths, 0)
	twentyFiveDAgo := now.AddDate(0, 0, -defaultRotateAfterLoginDays)

	effectiveCap, err := computeCloudEsiPublishBatchSize(ctx, deps, sixMoAgo, twentyFiveDAgo, now)
	if err != nil {
		logs.WarnCtx(ctx, "cloud esi refresh maintenance: batch size fallback", "component", schedulerLogComponent, "error", err)
		effectiveCap = maxCloudEsiAccountsFallback
	}
	if effectiveCap < 1 {
		effectiveCap = 1
	}

	afterID, err := loadCloudEsiRefreshBookmark(ctx, deps)
	if err != nil {
		logs.ErrorCtx(ctx, "cloud esi refresh maintenance: bookmark read failed", "component", schedulerLogComponent, "error", err)
		return err
	}

	filter := cloudEsiRefreshUserFilter(sixMoAgo, twentyFiveDAgo, afterID)
	opts := options.Find().
		SetProjection(bson.M{"_id": 1}).
		SetSort(bson.D{{Key: "_id", Value: 1}}).
		SetLimit(int64(effectiveCap)).
		SetHint(indexing.UsersMetaLastLoginAtIndexName)

	col := deps.Mongo.Database(mongocore.DatabaseName).Collection(mongocore.CollectionUsers)
	cur, err := col.Find(ctx, filter, opts)
	if err != nil {
		logs.ErrorCtx(ctx, "cloud esi refresh maintenance: user query failed", "component", schedulerLogComponent, "error", err)
		return err
	}
	defer cur.Close(ctx)

	var batch []string
	for cur.Next(ctx) {
		var row struct {
			ID string `bson:"_id"`
		}
		if err := cur.Decode(&row); err != nil {
			logs.WarnCtx(ctx, "cloud esi refresh maintenance: decode user row", "component", schedulerLogComponent, "error", err)
			continue
		}
		if row.ID != "" {
			batch = append(batch, row.ID)
		}
	}
	if err := cur.Err(); err != nil {
		return err
	}

	if len(batch) == 0 {
		logs.DebugCtx(ctx, "cloud esi refresh maintenance: no eligible accounts this slice",
			"component", schedulerLogComponent,
			"effective_cap", effectiveCap,
			"bookmark_before", afterID)
		_ = advanceCloudEsiRefreshBookmark(ctx, deps, batch, effectiveCap)
		return nil
	}

	published := microBatchPublishCloudEsiTasks(ctx, deps, task, batch)

	if err := advanceCloudEsiRefreshBookmark(ctx, deps, batch, effectiveCap); err != nil {
		logs.ErrorCtx(ctx, "cloud esi refresh maintenance: bookmark advance failed", "component", schedulerLogComponent, "error", err)
		return err
	}
	if deps.Redis == nil && len(batch) > 0 {
		logs.WarnCtx(ctx, "cloud esi refresh maintenance: redis unavailable; bookmark not persisted — next run may re-queue the same accounts",
			"component", schedulerLogComponent)
	}

	logs.InfoCtx(ctx, "cloud esi refresh maintenance cron complete",
		"component", schedulerLogComponent,
		"matched_users", len(batch),
		"tasks_published", published,
		"effective_batch_cap", effectiveCap,
		"bookmark_before", afterID,
		"login_window_from_utc", sixMoAgo.Format(time.RFC3339),
		"login_window_before_utc", twentyFiveDAgo.Format(time.RFC3339),
	)
	return nil
}

func computeCloudEsiPublishBatchSize(ctx context.Context, deps contract.Dependencies, sixMoAgo, twentyFiveDAgo, now time.Time) (int, error) {
	filter := cloudEsiRefreshUserFilter(sixMoAgo, twentyFiveDAgo, "")
	countCtx, cancel := context.WithTimeout(ctx, 12*time.Second)
	defer cancel()

	col := deps.Mongo.Database(mongocore.DatabaseName).Collection(mongocore.CollectionUsers)
	total, err := col.CountDocuments(countCtx, filter, options.Count().SetHint(indexing.UsersMetaLastLoginAtIndexName))
	if err != nil {
		return 0, err
	}
	if total == 0 {
		return minCloudEsiAccountsBatch, nil
	}

	target := int(math.Ceil(float64(total) / runsPerDayCloudEsi))
	const buffer = 1.12
	batch := int(math.Ceil(float64(target) * buffer))
	if batch < minCloudEsiAccountsBatch {
		batch = minCloudEsiAccountsBatch
	}
	if batch > maxCloudEsiAccountsAbsolute {
		batch = maxCloudEsiAccountsAbsolute
	}

	inDT, downtimeEnd := schedesi.IsInEVEDowntime(now)
	if inDT {
		windowEnd := now.Add(microBatchPublishWindow)
		availableAfter := windowEnd.Sub(downtimeEnd)
		if availableAfter < 0 {
			availableAfter = 0
		}
		downtimeCap := int(math.Floor(float64(batch) * availableAfter.Seconds() / microBatchPublishWindow.Seconds()))
		if downtimeCap < batch && downtimeCap >= 0 {
			if downtimeCap < 1 {
				downtimeCap = 1
			}
			logs.InfoCtx(ctx, "cloud esi refresh batch size reduced by downtime window",
				"component", schedulerLogComponent,
				"original_batch_size", batch,
				"downtime_capped_batch_size", downtimeCap,
				"available_after_downtime_seconds", int(availableAfter.Seconds()),
				"publish_window_seconds", int(microBatchPublishWindow.Seconds()),
				"downtime_end_utc", downtimeEnd.Format(time.RFC3339))
			batch = downtimeCap
		}
	}

	return batch, nil
}

// microBatchPlan splits accountIDs across stagger windows (same math as microBatchPublishCloudEsiTasks).
func microBatchPlan(accountCount int) (plannedSlices int, requestsPerSlice int) {
	if accountCount < 1 {
		return 0, 0
	}
	plannedSlices = int(microBatchPublishWindow / microBatchInterval)
	if plannedSlices < 1 {
		plannedSlices = 1
	}
	if accountCount < plannedSlices {
		plannedSlices = accountCount
	}
	requestsPerSlice = int(math.Ceil(float64(accountCount) / float64(plannedSlices)))
	return plannedSlices, requestsPerSlice
}

func microBatchPublishCloudEsiTasks(ctx context.Context, deps contract.Dependencies, task taskscore.Task, accountIDs []string) int {
	if len(accountIDs) == 0 {
		return 0
	}
	_, requestsPerSlice := microBatchPlan(len(accountIDs))

	published := 0
	for start := 0; start < len(accountIDs); start += requestsPerSlice {
		end := start + requestsPerSlice
		if end > len(accountIDs) {
			end = len(accountIDs)
		}
		for _, accountID := range accountIDs[start:end] {
			payload := natscore.CloudStoredEsiRefreshMaintenanceRequest{
				AccountID:               accountID,
				RotateAfterLoginDays:    defaultRotateAfterLoginDays,
				AbandonAfterLoginMonths: defaultAbandonAfterLoginMonths,
			}
			if err := natscore.PublishTask(
				ctx,
				deps.JSContext,
				task.Subject,
				task.Name,
				payload,
				deps.NATS,
				task.DefaultPriority,
			); err != nil {
				logs.ErrorCtx(ctx, "cloud esi refresh maintenance: publish failed", "component", schedulerLogComponent,
					"subject", task.Subject, "account_id", accountID, "error", err)
				continue
			}
			published++
		}
		if end >= len(accountIDs) {
			break
		}
		timer := time.NewTimer(microBatchInterval)
		select {
		case <-ctx.Done():
			timer.Stop()
			return published
		case <-timer.C:
		}
	}
	return published
}

func cloudEsiRefreshUserFilter(sixMoAgo, rotateCutoffTime time.Time, afterID string) bson.M {
	hasRefreshRows := bson.M{
		"$expr": bson.M{
			"$gt": []interface{}{
				bson.M{"$size": bson.M{"$ifNull": []interface{}{"$refreshTokens", []interface{}{}}}},
				0,
			},
		},
	}
	notDeleted := bson.M{
		"$or": []bson.M{
			{"_meta.deletedAt": bson.M{"$exists": false}},
			{"_meta.deletedAt": nil},
		},
	}
	loginWindow := bson.M{
		"_meta.lastLoginAt": bson.M{
			"$gte": sixMoAgo,
			"$lt":  rotateCutoffTime,
		},
	}
	and := []bson.M{
		{"userCloudAccounts": true},
		loginWindow,
		hasRefreshRows,
		notDeleted,
	}
	if afterID != "" {
		and = append(and, bson.M{"_id": bson.M{"$gt": afterID}})
	}
	return bson.M{"$and": and}
}

func loadCloudEsiRefreshBookmark(ctx context.Context, deps contract.Dependencies) (string, error) {
	if deps.Redis == nil {
		return "", nil
	}
	s, err := deps.Redis.Get(ctx, cloudEsiRefreshBookmarkKey).Result()
	if err == redislib.Nil || s == "" {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	return s, nil
}

func advanceCloudEsiRefreshBookmark(ctx context.Context, deps contract.Dependencies, batch []string, effectiveCap int) error {
	if deps.Redis == nil {
		return nil
	}
	switch {
	case len(batch) == 0:
		return deps.Redis.Del(ctx, cloudEsiRefreshBookmarkKey).Err()
	case len(batch) < effectiveCap:
		return deps.Redis.Del(ctx, cloudEsiRefreshBookmarkKey).Err()
	default:
		last := batch[len(batch)-1]
		return deps.Redis.Set(ctx, cloudEsiRefreshBookmarkKey, last, 0).Err()
	}
}
