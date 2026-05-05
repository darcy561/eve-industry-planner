package maintenance

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	mongocore "eve-industry-planner/shared/core/mongo"
	natscore "eve-industry-planner/shared/core/nats"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/shared/models"
	esitasks "eve-industry-planner/worker/tasks/esi"

	"github.com/hibiken/asynq"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
)

const defaultInactivePlannerStaleYears = 2

// InactiveAccountPlannerCleanup deletes live planner job documents and groups for an account when the
// users document still indicates last login older than the stale-age threshold (re-checked here).
func InactiveAccountPlannerCleanup(ctx context.Context, task *asynq.Task, deps *esitasks.TaskDependencies) error {
	if task == nil {
		return fmt.Errorf("task is nil")
	}
	if deps == nil || deps.Mongo == nil {
		return fmt.Errorf("mongo client is required")
	}
	payload, err := esitasks.UnmarshalTaskPayload[natscore.InactiveAccountPlannerCleanupRequest](task)
	if err != nil {
		return fmt.Errorf("invalid payload: %w", err)
	}
	accountID := strings.TrimSpace(payload.AccountID)
	if accountID == "" {
		return fmt.Errorf("account_id is required")
	}
	years := payload.StaleAgeYears
	if years <= 0 {
		years = defaultInactivePlannerStaleYears
	}
	cutoff := time.Now().UTC().AddDate(-years, 0, 0)

	db := deps.Mongo.Database(mongocore.DatabaseName)
	usersCol := db.Collection(mongocore.CollectionUsers)

	var userDoc models.UserAccountDocument
	err = usersCol.FindOne(ctx, bson.M{"_id": accountID}).Decode(&userDoc)
	if errors.Is(err, mongo.ErrNoDocuments) {
		logs.InfoCtx(ctx, "inactive account planner cleanup: user missing; skipping",
			"account_id", accountID)
		return nil
	}
	if err != nil {
		return fmt.Errorf("load user %s: %w", accountID, err)
	}
	if userDoc.MetaData.DeletedAt != nil {
		logs.InfoCtx(ctx, "inactive account planner cleanup: user deleted; skipping",
			"account_id", accountID)
		return nil
	}
	ll := userDoc.MetaData.LastLoginAt
	if !ll.IsZero() && !ll.Before(cutoff) {
		logs.InfoCtx(ctx, "inactive account planner cleanup: login within threshold; skipping delete",
			"account_id", accountID,
			"last_login_at", ll.Format(time.RFC3339),
			"cutoff_utc", cutoff.Format(time.RFC3339))
		return nil
	}

	acctFilter := bson.M{"_meta.accountID": accountID}

	jobDocsCol := db.Collection(mongocore.CollectionUserJobDocuments)
	jobsLegacyCol := db.Collection(mongocore.CollectionJobs)
	groupsCol := db.Collection(mongocore.CollectionUserJobGroups)

	var jobsDocDeleted, jobsLegacyDeleted, groupsDeleted int64

	retry := mongocore.DefaultRetryConfig()
	retry.OperationName = fmt.Sprintf("inactive planner cleanup job docs %s", accountID)
	err = mongocore.RetryMongoOperation(ctx, retry, func() error {
		res, derr := jobDocsCol.DeleteMany(ctx, acctFilter)
		if derr != nil {
			return derr
		}
		jobsDocDeleted = res.DeletedCount
		return nil
	})
	if err != nil {
		return fmt.Errorf("delete user_job_documents for %s: %w", accountID, err)
	}

	retry.OperationName = fmt.Sprintf("inactive planner cleanup legacy jobs %s", accountID)
	err = mongocore.RetryMongoOperation(ctx, retry, func() error {
		res, derr := jobsLegacyCol.DeleteMany(ctx, acctFilter)
		if derr != nil {
			return derr
		}
		jobsLegacyDeleted = res.DeletedCount
		return nil
	})
	if err != nil {
		return fmt.Errorf("delete jobs collection for %s: %w", accountID, err)
	}

	retry.OperationName = fmt.Sprintf("inactive planner cleanup groups %s", accountID)
	err = mongocore.RetryMongoOperation(ctx, retry, func() error {
		res, derr := groupsCol.DeleteMany(ctx, acctFilter)
		if derr != nil {
			return derr
		}
		groupsDeleted = res.DeletedCount
		return nil
	})
	if err != nil {
		return fmt.Errorf("delete user_job_groups for %s: %w", accountID, err)
	}

	lastLoginLog := ""
	if !ll.IsZero() {
		lastLoginLog = ll.UTC().Format(time.RFC3339)
	}
	logs.InfoCtx(ctx, "inactive account planner cleanup complete",
		"account_id", accountID,
		"deleted_user_job_documents", jobsDocDeleted,
		"deleted_legacy_jobs", jobsLegacyDeleted,
		"deleted_user_job_groups", groupsDeleted,
		"last_login_at", lastLoginLog,
		"cutoff_utc", cutoff.Format(time.RFC3339),
	)
	return nil
}
