package auth

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	rediscore "eve-industry-planner/shared/core/redis"

	"github.com/redis/go-redis/v9"
)

// ErrAccountSessionsConflict is returned when an account_sessions write loses optimistic concurrency.
var ErrAccountSessionsConflict = errors.New("account sessions record conflict")

const accountSessionsSaveMaxAttempts = 3

type accountSessionsCAS struct {
	exists        bool
	updatedAt     time.Time
	grantsVersion int64
}

func accountSessionsCASFromRecord(rec *AccountSessionsRecord, exists bool) accountSessionsCAS {
	if rec == nil {
		return accountSessionsCAS{}
	}
	return accountSessionsCAS{
		exists:        exists,
		updatedAt:     rec.UpdatedAt.UTC(),
		grantsVersion: rec.GrantsVersion,
	}
}

func accountSessionsCASMatch(current *AccountSessionsRecord, cas accountSessionsCAS) bool {
	if current == nil {
		return false
	}
	return current.UpdatedAt.UTC().Equal(cas.updatedAt) && current.GrantsVersion == cas.grantsVersion
}

func normalizeAccountSessionsRecord(rec *AccountSessionsRecord, accountID string) {
	if rec == nil {
		return
	}
	acc := strings.TrimSpace(accountID)
	if rec.AccountID == "" {
		rec.AccountID = acc
	}
	if rec.Sessions == nil {
		rec.Sessions = map[string]AccountSession{}
	}
	if rec.Grants.CorporationIDs == nil {
		rec.Grants.CorporationIDs = []int64{}
	}
	if rec.Grants.AllianceIDs == nil {
		rec.Grants.AllianceIDs = []int64{}
	}
	rec.Grants.CorporationIDs = normalizeIDs(rec.Grants.CorporationIDs)
	rec.Grants.AllianceIDs = normalizeIDs(rec.Grants.AllianceIDs)
}

func loadAccountSessionsRecordRaw(ctx context.Context, redisClient *redis.Client, accountID string) (*AccountSessionsRecord, bool, error) {
	acc := strings.TrimSpace(accountID)
	if acc == "" {
		return nil, false, errors.New("account_id is required")
	}
	if redisClient == nil {
		return nil, false, errors.New("redis client is nil")
	}
	key := accountSessionsKey(acc)
	var rec AccountSessionsRecord
	err := rediscore.GetJSON(ctx, redisClient, key, &rec)
	if err == redis.Nil {
		rec = AccountSessionsRecord{
			AccountID: acc,
			Grants: SessionGrants{
				CorporationIDs: []int64{},
				AllianceIDs:    []int64{},
			},
			Sessions: map[string]AccountSession{},
		}
		return &rec, false, nil
	}
	if err != nil {
		return nil, false, fmt.Errorf("failed to get account sessions: %w", err)
	}
	normalizeAccountSessionsRecord(&rec, acc)
	return &rec, true, nil
}

func saveAccountSessionsRecordCAS(ctx context.Context, redisClient *redis.Client, rec *AccountSessionsRecord, cas accountSessionsCAS) error {
	if rec == nil {
		return errors.New("account sessions record is nil")
	}
	acc := strings.TrimSpace(rec.AccountID)
	if acc == "" {
		return errors.New("account_id is required")
	}
	if redisClient == nil {
		return errors.New("redis client is nil")
	}
	normalizeAccountSessionsRecord(rec, acc)
	rec.GrantsVersion = cas.grantsVersion + 1
	rec.UpdatedAt = time.Now().UTC()

	key := accountSessionsKey(acc)
	payload, err := json.Marshal(rec)
	if err != nil {
		return fmt.Errorf("failed to marshal account sessions: %w", err)
	}

	err = redisClient.Watch(ctx, func(tx *redis.Tx) error {
		currentBytes, err := tx.Get(ctx, key).Bytes()
		if err == redis.Nil {
			if cas.exists {
				return ErrAccountSessionsConflict
			}
			_, err = tx.Set(ctx, key, payload, SessionTTL).Result()
			return err
		}
		if err != nil {
			return err
		}
		if !cas.exists {
			return ErrAccountSessionsConflict
		}
		var current AccountSessionsRecord
		if err := json.Unmarshal(currentBytes, &current); err != nil {
			return fmt.Errorf("failed to unmarshal account sessions for CAS: %w", err)
		}
		if !accountSessionsCASMatch(&current, cas) {
			return ErrAccountSessionsConflict
		}
		_, err = tx.Set(ctx, key, payload, SessionTTL).Result()
		return err
	}, key)
	if err == nil {
		return nil
	}
	if errors.Is(err, ErrAccountSessionsConflict) {
		return err
	}
	if err == redis.TxFailedErr {
		return ErrAccountSessionsConflict
	}
	return err
}

// mutateAccountSessionsRecord loads account_sessions, applies mutate, and saves with optimistic locking (retries on conflict).
func mutateAccountSessionsRecord(ctx context.Context, redisClient *redis.Client, accountID string, mutate func(*AccountSessionsRecord) error) error {
	acc := strings.TrimSpace(accountID)
	if acc == "" {
		return errors.New("account_id is required")
	}
	var lastErr error
	for range accountSessionsSaveMaxAttempts {
		rec, exists, err := loadAccountSessionsRecordRaw(ctx, redisClient, acc)
		if err != nil {
			return err
		}
		cas := accountSessionsCASFromRecord(rec, exists)

		now := time.Now().UTC()
		removed, pruned := pruneExpiredSessions(rec, now)
		if pruned {
			if err := saveAccountSessionsRecordCAS(ctx, redisClient, rec, cas); err != nil {
				if errors.Is(err, ErrAccountSessionsConflict) {
					lastErr = err
					continue
				}
				return err
			}
			rec, exists, err = loadAccountSessionsRecordRaw(ctx, redisClient, acc)
			if err != nil {
				return err
			}
			cas = accountSessionsCASFromRecord(rec, exists)
			if len(removed) > 0 {
				deleteSessionIndexKeys(ctx, redisClient, removed...)
			}
		}

		if err := mutate(rec); err != nil {
			return err
		}
		if err := saveAccountSessionsRecordCAS(ctx, redisClient, rec, cas); err != nil {
			if errors.Is(err, ErrAccountSessionsConflict) {
				lastErr = err
				continue
			}
			return err
		}
		return nil
	}
	if lastErr != nil {
		return lastErr
	}
	return ErrAccountSessionsConflict
}
