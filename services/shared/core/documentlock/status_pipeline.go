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

// statusDocRef identifies one document in a status fetch.
type statusDocRef struct {
	Collection string
	DocID      string
}

// statusBatchFetch builds the /lock-state payload for each ref in one Redis round trip,
// pruning expired viewers and deleting expired lock records on the way.
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
		_ = zrem[i].Val()

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
			payload["holderParticipantID"] = ParticipantID(rec.HolderSessionID)
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
				payload["probeTargetParticipantID"] = ParticipantID(rec.ProbeTargetSessionID)
				payload["probeExpiresAtUnix"] = rec.ProbeExpiresAtUnix
			}
		}

		if vc, verr := zcard[i].Result(); verr == nil {
			payload["viewerCount"] = vc
		}

		results[i] = payload
	}

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

// readPipelineLock returns the lock record from an executed GET, or "" when the key
// does not exist.
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
