package maintenance

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"eve-industry-planner/shared/core/config"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/models"
	eipnats "eve-industry-planner/shared/nats"
	esicore "eve-industry-planner/worker/esi"
	esitasks "eve-industry-planner/worker/tasks/esi"

	"github.com/hibiken/asynq"
	"go.mongodb.org/mongo-driver/v2/bson"
	mongodriver "go.mongodb.org/mongo-driver/v2/mongo"
)

const (
	defaultRotateAfterLoginDays    = 25
	defaultAbandonAfterLoginMonths = 6
)

// CloudStoredEsiRefreshMaintenance rotates Mongo-stored ESI OAuth refresh rows for one cloud account
// when last login is within the maintenance band (re-checked here). Accounts beyond the abandon window
// are skipped so tokens may go stale as intended.
func CloudStoredEsiRefreshMaintenance(ctx context.Context, task *asynq.Task, deps *esitasks.TaskDependencies) error {
	if task == nil {
		return fmt.Errorf("task is nil")
	}
	if deps == nil || deps.Mongo == nil {
		return fmt.Errorf("mongo client is required")
	}
	payload, err := esitasks.UnmarshalTaskPayload[eipnats.CloudStoredEsiRefreshMaintenanceRequest](task)
	if err != nil {
		return fmt.Errorf("invalid payload: %w", err)
	}
	accountID := strings.TrimSpace(payload.AccountID)
	if accountID == "" {
		return fmt.Errorf("account_id is required")
	}
	rotateDays := payload.RotateAfterLoginDays
	if rotateDays <= 0 {
		rotateDays = defaultRotateAfterLoginDays
	}
	abandonMonths := payload.AbandonAfterLoginMonths
	if abandonMonths <= 0 {
		abandonMonths = defaultAbandonAfterLoginMonths
	}

	cfg, err := config.LoadCloudStoredESI()
	if err != nil {
		return err
	}
	if cfg.Keys.Keyring == nil {
		return fmt.Errorf("refresh token keyring is not configured")
	}

	if deps.ESIClient != nil && deps.Redis != nil {
		statusResult := esicore.CheckServerStatus(ctx, deps.ESIClient, deps.Redis)
		if err := esitasks.HandleStatusCheckResult(ctx, statusResult, "cloud stored esi refresh maintenance"); err != nil {
			return err
		}
	}

	now := time.Now().UTC()
	rotateCutoff := now.AddDate(0, 0, -rotateDays)
	abandonCutoff := now.AddDate(0, -abandonMonths, 0)

	mongo := deps.Mongo
	var userDoc models.UserAccountDocument
	if err := mongo.Users.Collection().FindOne(ctx, bson.M{"_id": accountID, "_meta.accountID": accountID}).Decode(&userDoc); err != nil {
		if errors.Is(err, mongodriver.ErrNoDocuments) {
			logs.InfoCtx(ctx, "cloud esi refresh maintenance: user not found", "account_id", accountID)
			return nil
		}
		return fmt.Errorf("load user: %w", err)
	}
	if userDoc.MetaData.DeletedAt != nil {
		logs.InfoCtx(ctx, "cloud esi refresh maintenance: user deleted", "account_id", accountID)
		return nil
	}
	if !userDoc.UserCloudAccounts {
		logs.InfoCtx(ctx, "cloud esi refresh maintenance: not a cloud account", "account_id", accountID)
		return nil
	}
	ll := userDoc.MetaData.LastLoginAt
	if ll.IsZero() {
		logs.InfoCtx(ctx, "cloud esi refresh maintenance: missing lastLoginAt; skipping", "account_id", accountID)
		return nil
	}
	if ll.Before(abandonCutoff) {
		logs.InfoCtx(ctx, "cloud esi refresh maintenance: past abandon window; allowing tokens to go stale",
			"account_id", accountID,
			"last_login_at", ll.UTC().Format(time.RFC3339),
			"abandon_cutoff_utc", abandonCutoff.Format(time.RFC3339))
		return nil
	}
	if !ll.Before(rotateCutoff) {
		logs.InfoCtx(ctx, "cloud esi refresh maintenance: login too recent for rotation window",
			"account_id", accountID,
			"last_login_at", ll.UTC().Format(time.RFC3339),
			"rotate_cutoff_utc", rotateCutoff.Format(time.RFC3339))
		return nil
	}

	stats, err := maintainAccountCloudRefreshTokens(ctx, mongo.Users, accountID, &cfg)
	if err != nil {
		if errors.Is(err, errCloudEsiMaintUserNotFound) {
			logs.InfoCtx(ctx, "cloud esi refresh maintenance: user not found", "account_id", accountID)
			return nil
		}
		if errors.Is(err, errCloudEsiMaintNotCloud) {
			logs.InfoCtx(ctx, "cloud esi refresh maintenance: not a cloud account", "account_id", accountID)
			return nil
		}
		return fmt.Errorf("cloud esi refresh maintenance: %w", err)
	}

	logs.InfoCtx(ctx, "cloud esi refresh maintenance task complete",
		"account_id", accountID,
		"rows_refreshed", stats.RowsRefreshed,
		"rows_key_rotate", stats.RowsKeyRotate,
		"rows_skipped", stats.RowsSkipped,
		"rows_failed", stats.RowsFailed,
		"rows_removed", stats.RowsRemoved,
		"rows_deferred_retry", stats.RowsRetryNext,
	)
	return nil
}
