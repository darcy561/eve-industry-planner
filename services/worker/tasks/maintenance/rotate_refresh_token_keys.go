package maintenance

import (
	"context"
	"fmt"
	"strings"
	"time"

	"eve-industry-planner/shared/core/config"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"
	eipnats "eve-industry-planner/shared/nats"
	"eve-industry-planner/worker/taskrun"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// RotateRefreshTokenKeys rotates encrypted refresh-token rows to the active key version.
func RotateRefreshTokenKeys(ctx context.Context, p eipnats.RotateRefreshTokenKeysRequest, deps *taskrun.Dependencies) error {
	if deps == nil || deps.Mongo == nil {
		return fmt.Errorf("mongo client is required")
	}

	p.AccountID = strings.TrimSpace(p.AccountID)
	p.FromVersion = strings.TrimSpace(p.FromVersion)
	if p.AccountID == "" {
		return fmt.Errorf("account_id is required")
	}

	rt, err := config.LoadCloudStoredESIKeys()
	if err != nil {
		return err
	}
	if rt.Keyring == nil {
		return fmt.Errorf("refresh token keyring is not configured")
	}

	kr := rt.Keyring
	activeVer := kr.NormalizedActiveVersion()

	mongo := deps.Mongo
	var userDoc models.UserAccountDocument
	if err := mongo.Users.Collection().FindOne(ctx, bson.M{"_id": p.AccountID, eipmongo.FieldMetaOwnerID: p.AccountID}).Decode(&userDoc); err != nil {
		return fmt.Errorf("load user for key rotation %s: %w", p.AccountID, err)
	}

	var (
		rowsRotated int
		rowsSkipped int
		rowsFailed  int
	)

	changed := false
	for i := range userDoc.RefreshTokens {
		rt := &userDoc.RefreshTokens[i]
		if strings.TrimSpace(rt.RTokenCiphertext) == "" {
			rowsSkipped++
			continue
		}
		version := strings.TrimSpace(rt.RTokenKeyVersion)
		if p.FromVersion != "" && version != p.FromVersion {
			rowsSkipped++
			continue
		}
		if p.FromVersion == "" && version == activeVer {
			rowsSkipped++
			continue
		}

		rotated, err := rt.ReencryptTowardActiveVersion(kr, false)
		if err != nil {
			rowsFailed++
			logs.WarnCtx(ctx, "rotate refresh tokens: re-wrap failed",
				"account_id", p.AccountID,
				"character_hash", rt.CharacterHash,
				"from_version", version,
				"error", err,
			)
			continue
		}
		if rotated {
			rowsRotated++
			changed = true
		}
	}

	if changed && !p.DryRun {
		if err := mongo.Users.PatchUserAccountFields(ctx, p.AccountID, bson.M{
			"refreshTokens":      userDoc.RefreshTokens,
			"_meta.lastModified": time.Now().UTC(),
		}, eipmongo.WithOpName(fmt.Sprintf("rotate refresh token keys %s", p.AccountID))); err != nil {
			return fmt.Errorf("persist rotated refresh tokens for %s: %w", p.AccountID, err)
		}
	}

	logs.InfoCtx(ctx, "rotate refresh token keys task completed",
		"account_id", p.AccountID,
		"rotated_rows", rowsRotated,
		"skipped_rows", rowsSkipped,
		"failed_rows", rowsFailed,
		"dry_run", p.DryRun,
		"active_version", activeVer,
		"from_version", p.FromVersion,
	)
	return nil
}
