package maintenance

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"eve-industry-planner/shared/core/config"
	"eve-industry-planner/shared/esiclient"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/models"
	eipnats "eve-industry-planner/shared/nats"
	"eve-industry-planner/worker/taskrun"

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
func CloudStoredEsiRefreshMaintenance(ctx context.Context, payload eipnats.CloudStoredEsiRefreshMaintenanceRequest, deps *taskrun.Dependencies) error {
	if deps == nil || deps.Mongo == nil {
		return fmt.Errorf("mongo client is required")
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

	// SSO goes down with everything else, so a rotation attempted during an
	// outage just fails. The fleet's view of availability is therefore worth
	// asking — but this holds no bucket and spends no token, because it talks to
	// login.eveonline.com rather than to ESI.
	if deps.ESI != nil {
		availability, err := deps.ESI.Availability(ctx)
		if err != nil {
			logs.DebugCtx(ctx, "could not read availability; proceeding", "error", err)
		} else if availability.Gated {
			logs.InfoCtx(ctx, "cloud esi refresh maintenance deferred: servers are not answering",
				"account_id", accountID, "next_probe", availability.NextProbe)
			return &esiclient.RateLimitError{
				Kind:       esiclient.KindDowntime,
				RetryAfter: availability.NextProbe,
				Reason:     "SSO token rotation deferred while the servers are away",
			}
		}
	}

	cfg, err := config.LoadCloudStoredESI()
	if err != nil {
		return err
	}
	if cfg.Keys.Keyring == nil {
		return fmt.Errorf("refresh token keyring is not configured")
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
	observeSSO(ctx, deps.ESI, stats)
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

// observeSSO tells the limiter what the token endpoint did, and nothing else.
//
// A row that failed to decrypt or re-encrypt never reached EVE SSO, so it is
// evidence about this deployment rather than about CCP's servers — counting it
// would let a broken keyring read as an outage. A pass that called SSO not at
// all says nothing either way and reports nothing.
func observeSSO(ctx context.Context, esi esiclient.API, stats cloudEsiMaintainStats) {
	if esi == nil {
		return
	}
	switch {
	case stats.SSOAnswered > 0:
		_ = esi.Observe(ctx, "evesso", true)
	case stats.SSOSilent > 0:
		_ = esi.Observe(ctx, "evesso", false)
	}
}
