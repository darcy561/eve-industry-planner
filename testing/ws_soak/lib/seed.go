package soaklib

import (
	"context"
	"fmt"
	"time"

	apihelperauth "eve-industry-planner/api/helper/auth"
	"eve-industry-planner/shared/wsplacement"

	"eve-industry-planner/shared/crypto/entityid"
	"github.com/redis/go-redis/v9"
)

type clientIdentity struct {
	Index      int
	AccountID  string
	SessionID  string
	Affinity   string // eip_tenant_affinity cookie value (may be empty)
	CorpID     int64
	AllianceID int64
	Cohort     cohortKind // limits profile only; empty for hold
}

type affinityMode string

const (
	affinityNone     affinityMode = "none"
	affinityAccount  affinityMode = "account"
	affinityCorp     affinityMode = "corp"
	affinityAlliance affinityMode = "alliance"
)

func parseAffinityMode(s string) (affinityMode, error) {
	switch affinityMode(s) {
	case affinityNone, affinityAccount, affinityCorp, affinityAlliance:
		return affinityMode(s), nil
	default:
		return "", fmt.Errorf("affinity must be none|account|corp|alliance, got %q", s)
	}
}

func buildIdentities(clients, accounts int, mode affinityMode, corpID, allianceID int64) ([]clientIdentity, error) {
	if clients < 1 {
		return nil, fmt.Errorf("clients must be >= 1")
	}
	if accounts < 1 {
		accounts = 1
	}
	if accounts > clients {
		accounts = clients
	}
	out := make([]clientIdentity, clients)
	for i := range clients {
		acctN := (i % accounts) + 1
		accountID := fmt.Sprintf("soak-acct-%d", acctN)
		sessionID := fmt.Sprintf("soak-sess-%d", i+1)
		id := clientIdentity{
			Index:      i,
			AccountID:  accountID,
			SessionID:  sessionID,
			CorpID:     corpID,
			AllianceID: allianceID,
		}
		switch mode {
		case affinityAccount:
			id.Affinity = wsplacement.TenantKeyAccount(accountID)
		case affinityCorp:
			if corpID == 0 {
				return nil, fmt.Errorf("affinity=corp requires -corp > 0")
			}
			id.Affinity = wsplacement.TenantKeyCorporation(CorporationRef(corpID))
		case affinityAlliance:
			if allianceID == 0 {
				return nil, fmt.Errorf("affinity=alliance requires -alliance > 0")
			}
			id.Affinity = wsplacement.TenantKeyAlliance(AllianceRef(allianceID))
		}
		out[i] = id
	}
	return out, nil
}

func seedSessions(ctx context.Context, rdb *redis.Client, ids []clientIdentity) error {
	seenAcct := map[string]bool{}
	entityCipher, err := entityid.NewFromEnv()
	if err != nil {
		return fmt.Errorf("load authz hmac key for seeded session grants: %w", err)
	}

	now := time.Now().UTC()
	for _, id := range ids {
		if err := apihelperauth.UpsertAccountSession(ctx, rdb, id.AccountID, apihelperauth.AccountSession{
			SessionID:        id.SessionID,
			CharacterHash:    "soak-hash",
			StartedAt:        now,
			LastSeenAt:       now,
			ReauthRequiredAt: apihelperauth.ReauthDeadlineFromSessionStart(now),
		}); err != nil {
			return fmt.Errorf("seed session %s: %w", id.SessionID, err)
		}
		if !seenAcct[id.AccountID] {
			seenAcct[id.AccountID] = true
			if id.CorpID != 0 || id.AllianceID != 0 {
				var corps, alliances []int64
				if id.CorpID != 0 {
					corps = []int64{id.CorpID}
				}
				if id.AllianceID != 0 {
					alliances = []int64{id.AllianceID}
				}
				if err := apihelperauth.UpdateAccountSessionGrants(ctx, rdb, entityCipher, id.AccountID, corps, alliances); err != nil {
					return fmt.Errorf("seed grants %s: %w", id.AccountID, err)
				}
			}
		}
	}
	return nil
}
