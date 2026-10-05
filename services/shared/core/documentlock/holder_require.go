package documentlock

import (
	"context"
	"errors"
	"eve-industry-planner/shared/jsoncodec"
	"time"

	"eve-industry-planner/shared/models"
	eipredis "eve-industry-planner/shared/redis"
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
	DocID               string `json:"docID"`
	HolderParticipantID string `json:"holderParticipantID"`
	LockExpiresAtUnix   int64  `json:"lockExpiresAtUnix"`
}

func decodeLockRecordFromRedisString(s string, nowUnix int64) (*LockRecord, bool) {
	if s == "" {
		return nil, false
	}
	var rec LockRecord
	if err := jsoncodec.Unmarshal([]byte(s), &rec); err != nil {
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

// LockedDocs names the documents of one collection a write would touch.
type LockedDocs struct {
	Collection string
	IDs        []string
}

// FirstHeldElsewhere checks each set in order and answers the first collection holding a document
// another session has open, with those documents; no Redis means nothing is held.
func FirstHeldElsewhere(ctx context.Context, rdb *eipredis.Redis, owner models.Owner, sessionID string, sets ...LockedDocs) (string, []LockHeldElsewhereItem, error) {
	for _, set := range sets {
		rejects, err := CollectLockHeldElsewhereRejects(ctx, rdb, owner, sessionID, set.Collection, set.IDs)
		if err != nil {
			return "", nil, err
		}
		if len(rejects) > 0 {
			return set.Collection, rejects, nil
		}
	}
	return "", nil, nil
}

// CollectLockHeldElsewhereRejects names each document in docIDs whose lock another session holds;
// none means the batch may proceed, and no Redis means no enforcement.
func CollectLockHeldElsewhereRejects(
	ctx context.Context,
	rdb *eipredis.Redis,
	owner models.Owner,
	requesterSessionID, collection string,
	docIDs []string,
) ([]LockHeldElsewhereItem, error) {
	if rdb.Driver() == nil {
		return nil, nil
	}
	if requesterSessionID == "" {
		return nil, ErrSessionRequiredForLockGate
	}
	if owner.IsZero() || collection == "" {
		return nil, nil
	}
	uniq := dedupeDocIDs(docIDs)
	if len(uniq) == 0 {
		return nil, nil
	}

	pipe, err := rdb.Pipe()
	if err != nil {
		return nil, err
	}
	cmds := make([]*eipredis.StringResult, len(uniq))
	for i, id := range uniq {
		cmds[i] = pipe.Get(ctx, LockKey(owner, collection, id))
	}
	if err := pipe.Exec(ctx); err != nil {
		return nil, err
	}

	now := time.Now().Unix()
	var rejects []LockHeldElsewhereItem
	for i, id := range uniq {
		s, err := cmds[i].Result()
		if eipredis.IsNotFound(err) {
			continue
		}
		if err != nil {
			return nil, err
		}
		rec, expired := decodeLockRecordFromRedisString(s, now)
		if rec == nil || expired || rec.HolderSessionID == "" {
			continue
		}
		if rec.HolderSessionID != requesterSessionID {
			rejects = append(rejects, LockHeldElsewhereItem{
				DocID:               id,
				HolderParticipantID: ParticipantID(rec.HolderSessionID),
				LockExpiresAtUnix:   rec.ExpiresAtUnix,
			})
		}
	}
	return rejects, nil
}
