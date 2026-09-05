package documentlock

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"

	eipmongo "eve-industry-planner/shared/mongo"

	"github.com/redis/go-redis/v9"
)

// ErrSessionRequiredForLockGate is returned by CollectLockHeldElsewhereRejects when
// Redis is available for enforcement but requesterSessionID is empty.
var ErrSessionRequiredForLockGate = errors.New("session required for document lock gate")

// ErrCodeLockHeldElsewhere is the JSON `error` field for HTTP 409 lock conflicts.
const ErrCodeLockHeldElsewhere = "lock_held_elsewhere"

// ErrCodeHandOverNoop is the JSON `error` field when POST /hand-over finds this
// session is not the Redis lock holder (stale UI or race).
const ErrCodeHandOverNoop = "doc_lock_hand_over_noop"

// LockHeldElsewhereItem is one row in the `rejected` array on 409 responses.
type LockHeldElsewhereItem struct {
	DocID             string `json:"docID"`
	HolderSessionID   string `json:"holderSessionID"`
	LockExpiresAtUnix int64  `json:"lockExpiresAtUnix"`
}

// HolderOutcome classifies the lock vs requester relationship.
type HolderOutcome string

const (
	// HolderOutcomeUnheld means no active lock (or expired record treated as absent).
	HolderOutcomeUnheld HolderOutcome = "unheld"
	// HolderOutcomeHeldByRequester means the requester holds the edit lock.
	HolderOutcomeHeldByRequester HolderOutcome = "held_by_requester"
	// HolderOutcomeHeldByAnother means another session holds the edit lock.
	HolderOutcomeHeldByAnother HolderOutcome = "held_by_other"
)

// HolderCheck is the structured result of RequireHolder.
type HolderCheck struct {
	Outcome           HolderOutcome
	HolderSessionID   string
	LockExpiresAtUnix int64
}

// RequireHolder inspects the Redis lock for (accountID, collection, docID).
// When rdb is nil, returns Unheld (caller skips API enforcement). When
// requesterSessionID is empty, returns an error — callers that enforce locks
// must require a session first.
func RequireHolder(ctx context.Context, rdb *redis.Client, accountID, requesterSessionID, collection, docID string) (HolderCheck, error) {
	if rdb == nil {
		return HolderCheck{Outcome: HolderOutcomeUnheld}, nil
	}
	if requesterSessionID == "" {
		return HolderCheck{}, ErrSessionRequiredForLockGate
	}
	if accountID == "" || collection == "" || docID == "" {
		return HolderCheck{Outcome: HolderOutcomeUnheld}, nil
	}
	rec, err := GetLock(ctx, rdb, accountID, collection, docID)
	if err != nil {
		return HolderCheck{}, err
	}
	if rec == nil || rec.HolderSessionID == "" {
		return HolderCheck{Outcome: HolderOutcomeUnheld}, nil
	}
	if rec.HolderSessionID == requesterSessionID {
		return HolderCheck{
			Outcome:           HolderOutcomeHeldByRequester,
			HolderSessionID:   rec.HolderSessionID,
			LockExpiresAtUnix: rec.ExpiresAtUnix,
		}, nil
	}
	return HolderCheck{
		Outcome:           HolderOutcomeHeldByAnother,
		HolderSessionID:   rec.HolderSessionID,
		LockExpiresAtUnix: rec.ExpiresAtUnix,
	}, nil
}

func decodeLockRecordFromRedisString(s string, nowUnix int64) (*LockRecord, bool) {
	if s == "" {
		return nil, false
	}
	var rec LockRecord
	if err := json.Unmarshal([]byte(s), &rec); err != nil {
		return nil, false
	}
	if rec.ExpiresAtUnix > 0 && nowUnix > rec.ExpiresAtUnix {
		return nil, true
	}
	return &rec, false
}

func dedupeDocIDs(ids []string) []string {
	seen := make(map[string]struct{}, len(ids))
	out := make([]string, 0, len(ids))
	for _, id := range ids {
		if id == "" {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		out = append(out, id)
	}
	return out
}

// JobGroupBypass maps job document ID → parent group ID. When the requester
// holds the group lock, a conflicting per-job lock does not block the write
// (group holder owns member job locks).
type JobGroupBypass map[string]string

// CollectLockHeldElsewhereRejects returns one entry per docID in `docIDs` (after
// dedupe) whose lock is held by a session other than requesterSessionID.
// Empty result means the batch may proceed. Nil rdb returns nil, nil (no enforcement).
// Empty requesterSessionID returns (nil, errNonEmptySession) — callers must require session when enforcing.
//
// jobGroupBypass is only consulted for eipmongo.CollectionJobDocuments; pass nil otherwise.
func CollectLockHeldElsewhereRejects(
	ctx context.Context,
	rdb *redis.Client,
	accountID, requesterSessionID, collection string,
	docIDs []string,
	jobGroupBypass JobGroupBypass,
) ([]LockHeldElsewhereItem, error) {
	if rdb == nil {
		return nil, nil
	}
	if requesterSessionID == "" {
		return nil, ErrSessionRequiredForLockGate
	}
	if accountID == "" || collection == "" {
		return nil, nil
	}
	uniq := dedupeDocIDs(docIDs)
	if len(uniq) == 0 {
		return nil, nil
	}

	pipe := rdb.Pipeline()
	cmds := make([]*redis.StringCmd, len(uniq))
	for i, id := range uniq {
		cmds[i] = pipe.Get(ctx, LockKey(accountID, collection, id))
	}
	if _, err := pipe.Exec(ctx); err != nil && err != redis.Nil {
		return nil, err
	}

	now := time.Now().Unix()
	useGroupBypass := collection == eipmongo.CollectionJobDocuments && len(jobGroupBypass) > 0
	groupHeldByRequester := map[string]bool{}
	if useGroupBypass {
		seenGroups := make(map[string]struct{})
		for _, id := range uniq {
			gid := strings.TrimSpace(jobGroupBypass[id])
			if gid == "" {
				continue
			}
			if _, ok := seenGroups[gid]; ok {
				continue
			}
			seenGroups[gid] = struct{}{}
			check, err := RequireHolder(ctx, rdb, accountID, requesterSessionID, eipmongo.CollectionJobGroups, gid)
			if err != nil {
				return nil, err
			}
			groupHeldByRequester[gid] = check.Outcome == HolderOutcomeHeldByRequester
		}
	}

	var rejects []LockHeldElsewhereItem
	for i, id := range uniq {
		s, err := cmds[i].Result()
		if err == redis.Nil {
			continue
		}
		if err != nil {
			return nil, err
		}
		rec, expired := decodeLockRecordFromRedisString(s, now)
		if rec == nil || expired {
			continue
		}
		if rec.HolderSessionID == "" {
			continue
		}
		if rec.HolderSessionID != requesterSessionID {
			if useGroupBypass {
				if gid := strings.TrimSpace(jobGroupBypass[id]); gid != "" && groupHeldByRequester[gid] {
					continue
				}
			}
			rejects = append(rejects, LockHeldElsewhereItem{
				DocID:             id,
				HolderSessionID:   rec.HolderSessionID,
				LockExpiresAtUnix: rec.ExpiresAtUnix,
			})
		}
	}
	return rejects, nil
}
