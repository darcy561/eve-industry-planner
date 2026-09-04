package maintenance

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"
	eipnats "eve-industry-planner/shared/nats"
	"eve-industry-planner/worker/taskrun"

	"go.mongodb.org/mongo-driver/v2/bson"
	mongodriver "go.mongodb.org/mongo-driver/v2/mongo"
)

const defaultInactivePlannerStaleYears = 2

// InactiveAccountPlannerCleanup deletes live planner job documents and groups for an account when the
// users document still indicates last login older than the stale-age threshold (re-checked here).
func InactiveAccountPlannerCleanup(ctx context.Context, payload eipnats.InactiveAccountPlannerCleanupRequest, deps *taskrun.Dependencies) error {
	if deps == nil || deps.Mongo == nil {
		return fmt.Errorf("mongo client is required")
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

	mongo := deps.Mongo
	usersCol := mongo.Users.Collection()

	var userDoc models.UserAccountDocument
	err := usersCol.FindOne(ctx, bson.M{"_id": accountID}).Decode(&userDoc)
	if errors.Is(err, mongodriver.ErrNoDocuments) {
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

	jobDocsCol := mongo.JobDocuments.Collection()
	jobsCol := mongo.Jobs.Collection()
	groupsCol := mongo.Groups.Collection()

	var jobsDocDeleted, jobsDeleted, groupsDeleted int64

	err = eipmongo.Retry(ctx, fmt.Sprintf("inactive planner cleanup job docs %s", accountID), func() error {
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

	err = eipmongo.Retry(ctx, fmt.Sprintf("inactive planner cleanup jobs %s", accountID), func() error {
		res, derr := jobsCol.DeleteMany(ctx, acctFilter)
		if derr != nil {
			return derr
		}
		jobsDeleted = res.DeletedCount
		return nil
	})
	if err != nil {
		return fmt.Errorf("delete jobs collection for %s: %w", accountID, err)
	}

	err = eipmongo.Retry(ctx, fmt.Sprintf("inactive planner cleanup groups %s", accountID), func() error {
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
		"deleted_jobs", jobsDeleted,
		"deleted_user_job_groups", groupsDeleted,
		"last_login_at", lastLoginLog,
		"cutoff_utc", cutoff.Format(time.RFC3339),
	)
	return nil
}
