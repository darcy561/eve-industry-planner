package maintenance

import (
	"context"
	"encoding/json"
	"time"

	"eve-industry-planner/core/scheduler/contract"
	natscore "eve-industry-planner/shared/core/nats"
	"eve-industry-planner/shared/logs"
	taskscore "eve-industry-planner/shared/tasks"

	redislib "github.com/redis/go-redis/v9"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

const (
	cronInactiveAccountPlannerCleanupName     = "cron.inactiveAccountPlannerCleanup"
	cronInactiveAccountPlannerCleanupSchedule = "0 8 * * 1" // Mondays 08:00 (typically UTC in containers)
	inactiveAccountCleanupBookmarkKey         = "scheduler:maintenance:inactive_account_cleanup_user_bookmark"
	defaultInactiveLoginStaleYears            = 2
	maxAccountsPublishedPerCron = 40
)

// ScheduleInactiveAccountPlannerCleanup runs weekly: walks users whose last login is older than
// the threshold (via Redis bookmark on user _id), and publishes one worker task per account to
// delete that account's planner jobs and groups.
func ScheduleInactiveAccountPlannerCleanup(deps contract.Dependencies, sched contract.Scheduler) (func(), error) {
	task := taskscore.InactiveAccountPlannerCleanup
	sched.RegisterHandler(cronInactiveAccountPlannerCleanupName, func(ctx context.Context, data json.RawMessage) error {
		_ = data
		if deps.Mongo == nil {
			logs.ErrorCtx(ctx, "inactive account planner cleanup: mongo client is nil", "component", schedulerLogComponent)
			return nil
		}
		cutoff := time.Now().UTC().AddDate(-defaultInactiveLoginStaleYears, 0, 0)
		afterID, err := loadInactiveCleanupBookmark(ctx, deps)
		if err != nil {
			logs.ErrorCtx(ctx, "inactive account planner cleanup: bookmark read failed", "component", schedulerLogComponent, "error", err)
			return err
		}

		filter := inactiveLoginUserFilter(cutoff, afterID)
		opts := options.Find().
			SetProjection(bson.M{"_id": 1}).
			SetSort(bson.D{{Key: "_id", Value: 1}}).
			SetLimit(int64(maxAccountsPublishedPerCron)).
			SetHint(usersMetaLastLoginAtIndexName)

		mongo := deps.Mongo
		col := mongo.Users.Collection()
		cur, err := col.Find(ctx, filter, opts)
		if err != nil {
			logs.ErrorCtx(ctx, "inactive account planner cleanup: user query failed", "component", schedulerLogComponent, "error", err)
			return err
		}
		defer cur.Close(ctx)

		var batch []string
		for cur.Next(ctx) {
			var row struct {
				ID string `bson:"_id"`
			}
			if err := cur.Decode(&row); err != nil {
				logs.WarnCtx(ctx, "inactive account planner cleanup: decode user row", "component", schedulerLogComponent, "error", err)
				continue
			}
			if row.ID != "" {
				batch = append(batch, row.ID)
			}
		}
		if err := cur.Err(); err != nil {
			return err
		}

		published := 0
		for _, accountID := range batch {
			payload := natscore.InactiveAccountPlannerCleanupRequest{
				AccountID:     accountID,
				StaleAgeYears: defaultInactiveLoginStaleYears,
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
				logs.ErrorCtx(ctx, "inactive account planner cleanup: publish failed", "component", schedulerLogComponent,
					"subject", task.Subject, "account_id", accountID, "error", err)
				continue
			}
			published++
		}

		if err := advanceInactiveCleanupBookmark(ctx, deps, batch); err != nil {
			logs.ErrorCtx(ctx, "inactive account planner cleanup: bookmark advance failed", "component", schedulerLogComponent, "error", err)
			return err
		}
		if deps.Redis == nil && len(batch) > 0 {
			logs.WarnCtx(ctx, "inactive account planner cleanup: redis unavailable; bookmark not persisted — next run may re-queue the same accounts",
				"component", schedulerLogComponent)
		}

		logs.InfoCtx(ctx, "inactive account planner cleanup cron complete",
			"component", schedulerLogComponent,
			"matched_users", len(batch),
			"tasks_published", published,
			"bookmark_before", afterID,
			"login_cutoff_utc", cutoff.Format(time.RFC3339),
		)
		return nil
	})
	if err := sched.ScheduleCronJob(cronInactiveAccountPlannerCleanupSchedule, cronInactiveAccountPlannerCleanupName); err != nil {
		return nil, err
	}
	return func() {}, nil
}

func inactiveLoginUserFilter(cutoff time.Time, afterID string) bson.M {
	staleLogin := bson.M{
		"$or": []bson.M{
			{"_meta.lastLoginAt": bson.M{"$lt": cutoff}},
			{"_meta.lastLoginAt": bson.M{"$exists": false}},
		},
	}
	notDeleted := bson.M{
		"$or": []bson.M{
			{"_meta.deletedAt": bson.M{"$exists": false}},
			{"_meta.deletedAt": nil},
		},
	}
	and := []bson.M{staleLogin, notDeleted}
	if afterID != "" {
		and = append(and, bson.M{"_id": bson.M{"$gt": afterID}})
	}
	return bson.M{"$and": and}
}

func loadInactiveCleanupBookmark(ctx context.Context, deps contract.Dependencies) (string, error) {
	if deps.Redis == nil {
		return "", nil
	}
	s, err := deps.Redis.Get(ctx, inactiveAccountCleanupBookmarkKey).Result()
	if err == redislib.Nil || s == "" {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	return s, nil
}

func advanceInactiveCleanupBookmark(ctx context.Context, deps contract.Dependencies, batch []string) error {
	if deps.Redis == nil {
		return nil
	}
	switch {
	case len(batch) == 0:
		return deps.Redis.Del(ctx, inactiveAccountCleanupBookmarkKey).Err()
	case len(batch) < maxAccountsPublishedPerCron:
		return deps.Redis.Del(ctx, inactiveAccountCleanupBookmarkKey).Err()
	default:
		last := batch[len(batch)-1]
		return deps.Redis.Set(ctx, inactiveAccountCleanupBookmarkKey, last, 0).Err()
	}
}
