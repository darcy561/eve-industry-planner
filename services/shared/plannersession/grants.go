package plannersession

import (
	"context"
	"encoding/json/jsontext"
	"eve-industry-planner/shared/jsoncodec"
	"fmt"
	"slices"

	"eve-industry-planner/shared/models"
	eipredis "eve-industry-planner/shared/redis"
)

// legacySessionGrants is the grant shape stored before grants became owner keys.
//
// Read from the raw record rather than from AccountRecord, whose Grants no
// longer carries these fields: a record written by the previous release decodes
// to an empty grant list, which is indistinguishable from an account holding no
// grants.
type legacySessionGrants struct {
	CorporationRefs []string `json:"corporation_refs"`
	AllianceRefs    []string `json:"alliance_refs"`
}

// GrantsRepairReport counts what a repair pass saw.
type GrantsRepairReport struct {
	Scanned  int
	Repaired int
	Failed   int
}

// SetGrants writes the owners a session may reach onto an account's record and
// every session under it.
//
// The keys are resolved by the caller, from the account's membership rows. This
// package holds sessions, tokens and grants in Redis and reads no database; a
// membership query here would give it one, and the same query would then have
// two homes. It writes what it is given.
func (s *Store) SetGrants(ctx context.Context, accountID string, granted models.OwnerKeys) error {
	return s.setGrants(ctx, accountID, models.SessionGrants{OwnerKeys: granted.Normalized()})
}

// setGrants writes grants onto the record and every session under it, under the
// same compare-and-set every other grant write uses.
func (s *Store) setGrants(ctx context.Context, accountID string, grants models.SessionGrants) error {
	return s.UpdateAccountRecord(ctx, accountID, func(rec *AccountRecord) error {
		rec.Grants = grants
		for sid, session := range rec.Sessions {
			session.Grants = grants
			rec.Sessions[sid] = session
		}
		return nil
	})
}

// RepairGrants rewrites stored grants into owner keys.
//
// Only the grants field is rewritten. The record also holds the session map that
// keeps an account signed in, so deleting the key to force a refill would sign
// every user out.
func (s *Store) RepairGrants(ctx context.Context, dryRun bool) (GrantsRepairReport, error) {
	var report GrantsRepairReport
	r, err := s.handle()
	if err != nil {
		return report, err
	}

	err = s.EachAccountKey(ctx, func(accountIDs []string) error {
		for _, accountID := range accountIDs {
			report.Scanned++

			repaired, err := grantsNeedingRepair(ctx, r, accountKeyForScanned(accountID), accountID)
			if err != nil {
				report.Failed++
				continue
			}
			if repaired == nil {
				continue
			}
			if dryRun {
				report.Repaired++
				continue
			}
			if err := s.setGrants(ctx, accountID, *repaired); err != nil {
				report.Failed++
				continue
			}
			report.Repaired++
		}
		return nil
	})
	if err != nil {
		return report, fmt.Errorf("scan account records: %w", err)
	}
	return report, nil
}

// grantsNeedingRepair returns the grants a record should hold, or nil when it
// already holds them.
func grantsNeedingRepair(ctx context.Context, r *eipredis.Redis, key, accountID string) (*models.SessionGrants, error) {
	var raw map[string]jsontext.Value
	if err := r.GetJSON(ctx, key, &raw); err != nil {
		return nil, err
	}

	var storedGrants struct {
		OwnerKeys []string `json:"owner_keys"`
		legacySessionGrants
	}
	if grants, ok := raw["grants"]; ok {
		if err := jsoncodec.Unmarshal(grants, &storedGrants); err != nil {
			return nil, err
		}
	}

	account := models.AccountOwner(accountID)
	if account.IsZero() {
		return nil, fmt.Errorf("account id %q yields no owner", accountID)
	}

	keys := models.NewOwnerKeys().
		Add(account).
		Union(storedGrants.OwnerKeys).
		AddRefs(models.OwnerCorporation, storedGrants.CorporationRefs).
		AddRefs(models.OwnerAlliance, storedGrants.AllianceRefs)

	repaired := models.SessionGrants{OwnerKeys: keys.Normalized()}
	if slices.Equal(storedGrants.OwnerKeys, repaired.OwnerKeys) {
		return nil, nil
	}
	return &repaired, nil
}
