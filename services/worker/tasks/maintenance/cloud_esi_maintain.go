package maintenance

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"eve-industry-planner/shared/core/config"
	"eve-industry-planner/shared/evesso"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"

	mongodriver "go.mongodb.org/mongo-driver/v2/mongo"
)

// cloudEsiMaintainStats summarizes maintainAccountCloudRefreshTokens.
type cloudEsiMaintainStats struct {
	RowsRefreshed int
	RowsKeyRotate int
	RowsSkipped   int
	RowsFailed    int
	RowsRemoved   int
	RowsRetryNext int
	// SSOAnswered and SSOSilent count only what the token endpoint did, so a
	// keyring or decrypt failure — which never reaches EVE SSO — cannot be read
	// as the servers being away.
	SSOAnswered int
	SSOSilent   int

	// AccessTokens are the tokens this pass obtained, in the order the rows were
	// walked. They are what revalidates the account's corporation and alliance
	// memberships: this is the one place outside a login where every stored token
	// is exchanged, so it is the only point at which EVE can be asked whether the
	// account is still where it was.
	//
	// Held only for the length of the task and never persisted or logged.
	AccessTokens []string

	// Complete reports whether this pass knows the whole of what the account can
	// still prove. A membership reconcile against a set missing an entity the
	// account is genuinely in would revoke access it holds, so the caller
	// reconciles only when this is true.
	//
	// A character whose token EVE refused outright does not make a pass
	// incomplete — see where this is set.
	Complete bool
}

var (
	errCloudEsiMaintKeyring          = errors.New("cloud esi maintenance: refresh token keyring not configured")
	errCloudEsiMaintMissingAccountID = errors.New("cloud esi maintenance: account_id is required")
	errCloudEsiMaintUserNotFound     = errors.New("cloud esi maintenance: user document not found")
	errCloudEsiMaintNotCloud         = errors.New("cloud esi maintenance: cloud storage mode is not enabled")
	errCloudEsiMaintPersist          = errors.New("cloud esi maintenance: failed to persist")
)

// knowsWhatTheAccountCanProve reports whether this pass ended holding the whole
// of what the account can still demonstrate to EVE.
//
// A row removed for a refused grant does not count against it: the character is
// gone for good, which is an answer rather than the absence of one. A row that
// failed transiently does, and so does one that refreshed without yielding a
// token — in both cases an entity the account is still in may be missing from
// the set, and reconciling on that would revoke access it holds.
func (s cloudEsiMaintainStats) knowsWhatTheAccountCanProve() bool {
	return s.RowsFailed == 0 && len(s.AccessTokens) == s.RowsRefreshed
}

// maintainAccountCloudRefreshTokens re-encrypts refresh rows to the active key version when needed,
// exchanges each row with EVE SSO, updates encryption keys, and persists.
func maintainAccountCloudRefreshTokens(ctx context.Context, users *eipmongo.Docs, accountID string, cfg *config.CloudStoredESI) (cloudEsiMaintainStats, error) {
	var stats cloudEsiMaintainStats
	if cfg == nil || cfg.Keys.Keyring == nil {
		return stats, errCloudEsiMaintKeyring
	}
	accountID = strings.TrimSpace(accountID)
	if accountID == "" {
		return stats, errCloudEsiMaintMissingAccountID
	}

	usersCol := users.Collection()
	var userDoc models.UserAccountDocument
	if err := usersCol.FindOne(ctx, eipmongo.AccountDocumentFilter(accountID)).Decode(&userDoc); err != nil {
		if errors.Is(err, mongodriver.ErrNoDocuments) {
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
	// Only the rows this pass actually altered; a row it merely read is left alone.
	changed := make([]models.RefreshToken, 0, len(userDoc.RefreshTokens))
	removed := make([]string, 0)

	recordFailure := func(row *models.RefreshToken, phase string, logWarn error, countRetry bool) bool {
		stats.RowsFailed++
		if logWarn != nil {
			logs.WarnCtx(callCtx, "cloud esi maintenance: "+phase+" failed",
				"account_id", accountID, "character_hash", row.CharacterHash, "error", logWarn)
		}
		row.CloudMaintRefreshFailures++
		if row.CloudMaintRefreshFailures >= 2 {
			stats.RowsRemoved++
			removed = append(removed, row.CharacterHash)
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
			continue
		}
		if strings.TrimSpace(row.RTokenCiphertext) == "" && strings.TrimSpace(row.RToken) == "" {
			stats.RowsSkipped++
			continue
		}

		if rotated, err := row.ReencryptTowardActiveVersion(cfg.Keys.Keyring, true); err != nil {
			if keep := recordFailure(&row, "key_reencrypt", err, true); keep {
				dirty = true
				changed = append(changed, row)
			} else {
				dirty = true
			}
			continue
		} else if rotated {
			stats.RowsKeyRotate++
			dirty = true
		}

		plain, err := row.PlainRefreshMaterial(cfg.Keys.Keyring)
		if err != nil {
			if keep := recordFailure(&row, "decrypt", err, true); keep {
				dirty = true
				changed = append(changed, row)
			} else {
				dirty = true
			}
			continue
		}

		tok, err := evesso.RefreshEveSSOAccessToken(callCtx, cfg.SSO.ClientID, cfg.SSO.ClientSecret, plain)
		if evesso.ServerAnswered(err) {
			stats.SSOAnswered++
		} else {
			stats.SSOSilent++
		}
		if err != nil {
			if evesso.IsPermanentRefreshFailure(err) {
				stats.RowsRemoved++
				dirty = true
				removed = append(removed, row.CharacterHash)
				logs.WarnCtx(callCtx, "cloud esi maintenance: removing row after permanent OAuth failure",
					"account_id", accountID, "character_hash", row.CharacterHash, "error", err)
				continue
			}
			if keep := recordFailure(&row, "sso_refresh", err, true); keep {
				dirty = true
				changed = append(changed, row)
			} else {
				dirty = true
			}
			continue
		}

		newRefresh := tok.RefreshToken
		if newRefresh == "" {
			newRefresh = plain
		}
		if err := row.EncryptRefreshAtRest(newRefresh, cfg.Keys.Keyring); err != nil {
			if keep := recordFailure(&row, "encrypt_after_refresh", err, true); keep {
				dirty = true
				changed = append(changed, row)
			} else {
				dirty = true
			}
			continue
		}
		row.CloudMaintRefreshFailures = 0
		stats.RowsRefreshed++
		if tok.AccessToken != "" {
			stats.AccessTokens = append(stats.AccessTokens, tok.AccessToken)
		}
		dirty = true
		changed = append(changed, row)
	}
	// A removed row does not block the reconcile: EVE refused the grant outright,
	// which says the character is gone for good rather than that it could not be
	// asked. Its affiliations are genuinely no longer the account's, so a pass
	// that lost one still knows exactly what the account can prove — and
	// reconciling on it removes the memberships that character was carrying,
	// which is the point.
	//
	// A failed row is the opposite: a transient error leaves the answer unknown,
	// and reconciling against a set missing an entity the account is still in
	// would revoke access it holds. A row skipped for not being due is neither —
	// it was exchanged recently enough that its token is still good.
	stats.Complete = stats.knowsWhatTheAccountCanProve()

	if !dirty {
		return stats, nil
	}

	// Row-scoped and change-scoped: a character the SPA rotates while this pass runs keeps its own
	// material, and a row this pass only read is not written back at all.
	opName := eipmongo.WithOpName(fmt.Sprintf("cloud esi maintenance persist %s", accountID))
	if err := users.PullUserRefreshTokenRows(callCtx, accountID, removed, opName); err != nil {
		return stats, fmt.Errorf("%w: %v", errCloudEsiMaintPersist, err)
	}
	if err := users.PatchUserRefreshTokenRows(callCtx, accountID, changed, opName); err != nil {
		return stats, fmt.Errorf("%w: %v", errCloudEsiMaintPersist, err)
	}

	return stats, nil
}
