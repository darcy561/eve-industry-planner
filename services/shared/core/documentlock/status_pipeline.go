// The batched read path behind /lock-state and /lock-state-batch.
//
// One pipeline queues four commands per document — the lock record, a prune of
// expired viewer presence, the viewer count and the waitlist length — so a
// batch of any size costs one round trip. A second pipeline follows only when a
// record was found already expired.

package documentlock

import (
	"context"
	"eve-industry-planner/shared/jsoncodec"
	"maps"
	"strconv"
	"time"

	"eve-industry-planner/shared/models"
	eipredis "eve-industry-planner/shared/redis"
)

// statusDocRef identifies one doc in a status fetch. owner is hoisted
// to a function-level arg because the batch is always scoped to one account.
type statusDocRef struct {
	Collection string
	DocID      string
}

// statusBatchFetch reads all the data needed to build /lock-state payloads
// for the given (collection, docID) pairs in a single Redis pipeline,
// returning a slice of payloads aligned to the input order.
//
// Side effects (mirrors the per-doc helpers it replaces):
//   - viewer-set ZREMRANGEBYSCORE prunes expired viewer presence entries
//     for every queried doc, so the returned `viewerCount` is fresh;
//   - any lock record whose `expiresAtUnix` lies in the past is DEL-ed in
//     a follow-up pipeline (Redis TTL would do this on its own; the
//     explicit DEL keeps reads consistent for the rest of this request).
//
// `owner` must be non-empty; an empty `refs` slice returns an empty
// result with no Redis traffic.
func statusBatchFetch(
	ctx context.Context,
	rdb *eipredis.Redis,
	owner models.Owner,
	readerAccountID string,
	refs []statusDocRef,
) ([]map[string]any, error) {
	if rdb.Driver() == nil {
		return nil, ErrLocksUnavailable
	}
	if len(refs) == 0 {
		return nil, nil
	}

	now := time.Now().Unix()
	nowScore := strconv.FormatInt(now, 10)

	pipe, err := rdb.Pipe()
	if err != nil {
		return nil, err
	}

	get := make([]*eipredis.StringResult, len(refs))
	zrem := make([]*eipredis.IntResult, len(refs))
	zcard := make([]*eipredis.IntResult, len(refs))
	llen := make([]*eipredis.IntResult, len(refs))

	for i, r := range refs {
		k := LockKey(owner, r.Collection, r.DocID)
		kv := ViewerPresenceKey(owner, r.Collection, r.DocID)
		kw := waitlistKey(owner, r.Collection, r.DocID)

		get[i] = pipe.Get(ctx, k)
		zrem[i] = pipe.DropScoredRange(ctx, kv, "0", nowScore)
		zcard[i] = pipe.CountScored(ctx, kv)
		llen[i] = pipe.Length(ctx, kw)
	}

	if err := pipe.Exec(ctx); err != nil {
		return nil, err
	}

	results := make([]map[string]any, len(refs))
	var expired []statusDocRef

	for i, r := range refs {
		_ = zrem[i].Val() // best-effort; missing key is fine

		payload := map[string]any{}

		raw, err := readPipelineLock(get[i])
		if err != nil {
			return nil, err
		}

		var rec *LockRecord
		if raw != "" {
			var lr LockRecord
			if jerr := jsoncodec.Unmarshal([]byte(raw), &lr); jerr == nil {
				if lr.ExpiresAtUnix > 0 && now > lr.ExpiresAtUnix {
					expired = append(expired, r)
				} else {
					rec = &lr
				}
			}
		}

		if rec == nil {
			payload["held"] = false
		} else {
			maps.Copy(payload, LockPayloadForRecord(rec.ExpiresAtUnix, rec.LeaseMode))
			payload["held"] = true
			payload["holderSessionID"] = rec.HolderSessionID
			// Whether the holder is the reader's own account, which is what
			// decides whether taking the lock back is theirs to do. A boolean
			// rather than the holder: who it is stays off the wire.
			payload["heldByThisAccount"] = readerAccountID != "" &&
				rec.AccountID == readerAccountID
			payload["extendCount"] = rec.ExtendCount
			if rec.LeaseMode != "" {
				payload["leaseMode"] = rec.LeaseMode
			}
			if wl, lerr := llen[i].Result(); lerr == nil {
				payload["waitlistLen"] = wl
			}
			if rec.ProbeTargetSessionID != "" {
				payload["probeTargetSessionID"] = rec.ProbeTargetSessionID
				payload["probeExpiresAtUnix"] = rec.ProbeExpiresAtUnix
			}
		}

		if vc, verr := zcard[i].Result(); verr == nil {
			payload["viewerCount"] = vc
		}

		results[i] = payload
	}

	// Best-effort cleanup of any expired locks observed in phase 1. We
	// don't fail the whole call if this pipeline errs — the keys will
	// expire naturally and the response above is still correct.
	if len(expired) > 0 {
		if delPipe, perr := rdb.Pipe(); perr == nil {
			for _, r := range expired {
				delPipe.Delete(ctx, LockKey(owner, r.Collection, r.DocID))
			}
			_ = delPipe.Exec(ctx)
		}
	}

	return results, nil
}

// readPipelineLock pulls the record from an already-executed GET. Returns
// ("", nil) when the key doesn't exist; ("", err) for true Redis errors —
// `redis.Nil` is mapped to the "not present" case.
func readPipelineLock(get *eipredis.StringResult) (string, error) {
	v, err := get.Result()
	if eipredis.IsNotFound(err) {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	return v, nil
}
