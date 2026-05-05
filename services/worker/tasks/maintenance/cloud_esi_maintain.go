package maintenance

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"eve-industry-planner/shared/core/config"
	"eve-industry-planner/shared/core/evesso"
	mongoput "eve-industry-planner/shared/core/mongo/put"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/shared/models"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
)

// cloudEsiMaintainStats summarizes maintainAccountCloudRefreshTokens.
type cloudEsiMaintainStats struct {
	RowsRefreshed int
	RowsKeyRotate int
	RowsSkipped   int
	RowsFailed    int
	RowsRemoved   int
	RowsRetryNext int
}

var (
	errCloudEsiMaintKeyring          = errors.New("cloud esi maintenance: refresh token keyring not configured")
	errCloudEsiMaintMissingAccountID = errors.New("cloud esi maintenance: account_id is required")
	errCloudEsiMaintUserNotFound     = errors.New("cloud esi maintenance: user document not found")
	errCloudEsiMaintNotCloud         = errors.New("cloud esi maintenance: cloud storage mode is not enabled")
	errCloudEsiMaintPersist          = errors.New("cloud esi maintenance: failed to persist")
)

func isPermanentOAuthRefreshFailure(err error) bool {
	if err == nil {
		return false
	}
	s := err.Error()
	return strings.Contains(s, "invalid_grant") || strings.Contains(s, "invalid_request")
}

// maintainAccountCloudRefreshTokens re-encrypts refresh rows to the active key version when needed,
// exchanges each row with EVE SSO, updates encryption keys, and persists.
func maintainAccountCloudRefreshTokens(ctx context.Context, usersCol *mongo.Collection, accountID string, cfg *config.Config) (cloudEsiMaintainStats, error) {
	var stats cloudEsiMaintainStats
	if cfg == nil || cfg.RefreshTokenKeyring == nil {
		return stats, errCloudEsiMaintKeyring
	}
	accountID = strings.TrimSpace(accountID)
	if accountID == "" {
		return stats, errCloudEsiMaintMissingAccountID
	}

	var userDoc models.UserAccountDocument
	if err := usersCol.FindOne(ctx, bson.M{"_id": accountID, "_meta.accountID": accountID}).Decode(&userDoc); err != nil {
		if err == mongo.ErrNoDocuments {
			return stats, errCloudEsiMaintUserNotFound
		}
		return stats, fmt.Errorf("cloud esi maintenance: load user: %w", err)
	}
	if !userDoc.UserCloudAccounts {
		return stats, errCloudEsiMaintNotCloud
	}

	callCtx, cancel := context.WithTimeout(ctx, 90*time.Second)
	defer cancel()

	dirty := false
	out := make([]models.RefreshToken, 0, len(userDoc.RefreshTokens))

	recordFailure := func(row *models.RefreshToken, phase string, logWarn error, countRetry bool) bool {
		stats.RowsFailed++
		if logWarn != nil {
			logs.WarnCtx(callCtx, "cloud esi maintenance: "+phase+" failed",
				"account_id", accountID, "character_hash", row.CharacterHash, "error", logWarn)
		}
		row.CloudMaintRefreshFailures++
		if row.CloudMaintRefreshFailures >= 2 {
			stats.RowsRemoved++
			logs.WarnCtx(callCtx, "cloud esi maintenance: removing row after repeated failures",
				"account_id", accountID, "character_hash", row.CharacterHash, "phase", phase,
				"failures", row.CloudMaintRefreshFailures)
			return false
		}
		if countRetry {
			stats.RowsRetryNext++
		}
		logs.InfoCtx(callCtx, "cloud esi maintenance: will retry token on next cycle",
			"account_id", accountID, "character_hash", row.CharacterHash, "phase", phase,
			"failures", row.CloudMaintRefreshFailures)
		return true
	}

	for _, rt := range userDoc.RefreshTokens {
		row := rt
		if strings.TrimSpace(row.CharacterHash) == "" {
			stats.RowsSkipped++
			out = append(out, row)
			continue
		}
		if strings.TrimSpace(row.RTokenCiphertext) == "" && strings.TrimSpace(row.RToken) == "" {
			stats.RowsSkipped++
			out = append(out, row)
			continue
		}

		if rotated, err := row.ReencryptTowardActiveVersion(cfg.RefreshTokenKeyring, true); err != nil {
			if keep := recordFailure(&row, "key_reencrypt", err, true); keep {
				dirty = true
				out = append(out, row)
			} else {
				dirty = true
			}
			continue
		} else if rotated {
			stats.RowsKeyRotate++
			dirty = true
		}

		plain, err := row.PlainRefreshMaterial(cfg.RefreshTokenKeyring)
		if err != nil {
			if keep := recordFailure(&row, "decrypt", err, true); keep {
				dirty = true
				out = append(out, row)
			} else {
				dirty = true
			}
			continue
		}

		tok, err := evesso.RefreshEveSSOAccessToken(callCtx, cfg.EveSSOClientID, cfg.EveSSOClientSecret, plain)
		if err != nil {
			if isPermanentOAuthRefreshFailure(err) {
				stats.RowsRemoved++
				dirty = true
				logs.WarnCtx(callCtx, "cloud esi maintenance: removing row after permanent OAuth failure",
					"account_id", accountID, "character_hash", row.CharacterHash, "error", err)
				continue
			}
			if keep := recordFailure(&row, "sso_refresh", err, true); keep {
				dirty = true
				out = append(out, row)
			} else {
				dirty = true
			}
			continue
		}

		newRefresh := tok.RefreshToken
		if newRefresh == "" {
			newRefresh = plain
		}
		if err := row.EncryptRefreshAtRest(newRefresh, cfg.RefreshTokenKeyring); err != nil {
			if keep := recordFailure(&row, "encrypt_after_refresh", err, true); keep {
				dirty = true
				out = append(out, row)
			} else {
				dirty = true
			}
			continue
		}
		row.CloudMaintRefreshFailures = 0
		stats.RowsRefreshed++
		dirty = true
		out = append(out, row)
	}

	userDoc.RefreshTokens = out

	if !dirty {
		return stats, nil
	}

	if err := mongoput.PatchUserAccountFields(ctx, usersCol, accountID, bson.M{
		"refreshTokens":      userDoc.RefreshTokens,
		"_meta.lastModified": time.Now().UTC(),
	}, fmt.Sprintf("cloud esi maintenance persist %s", accountID)); err != nil {
		return stats, fmt.Errorf("%w: %v", errCloudEsiMaintPersist, err)
	}

	return stats, nil
}
