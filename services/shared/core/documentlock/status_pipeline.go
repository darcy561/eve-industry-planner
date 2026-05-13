// status_pipeline.go contains the batched-pipeline implementation of the
// /lock-state and /lock-state-batch read paths.
//
// # What changed (vs. the previous per-doc loop)
//
// The old implementation called `StatusPayloadForDoc` in a loop, which
// for each doc issued ~3 sequential Redis round-trips (GET lock, then a
// piped ZREM+ZCARD for viewers, then LLEN for the waitlist). For a 50-doc
// batch that meant ~150 RTTs — most of the wall time was network latency,
// not Redis CPU.
//
// `statusBatchFetch` collapses that into:
//
//   - Phase 1: a single pipeline queuing 4 commands per doc (GET, viewer
//     ZREMRANGEBYSCORE, viewer ZCARD, waitlist LLEN). Total: 1 round-trip
//     regardless of batch size.
//   - Phase 2 (only when needed): a pipeline of DELs for any expired lock
//     records observed in phase 1. Usually a no-op.
//
// Net cost for an N-doc /lock-state-batch: 1 RTT (common case) or 2 RTTs
// (when some records have expired between the last sweep and this call).

package documentlock

import (
	"context"
	"encoding/json"
	"strconv"
	"time"

	"github.com/redis/go-redis/v9"
)

// statusDocRef identifies one doc in a status fetch. accountID is hoisted
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
// `accountID` must be non-empty; an empty `refs` slice returns an empty
// result with no Redis traffic.
func statusBatchFetch(
	ctx context.Context,
	rdb *redis.Client,
	accountID string,
	refs []statusDocRef,
) ([]map[string]any, error) {
	if rdb == nil {
		return nil, ErrLocksUnavailable
	}
	if len(refs) == 0 {
		return nil, nil
	}

	now := time.Now().Unix()
	nowScore := strconv.FormatInt(now, 10)

	pipe := rdb.Pipeline()

	get := make([]*redis.StringCmd, len(refs))
	zrem := make([]*redis.IntCmd, len(refs))
	zcard := make([]*redis.IntCmd, len(refs))
	llen := make([]*redis.IntCmd, len(refs))

	for i, r := range refs {
		k := LockKey(accountID, r.Collection, r.DocID)
		kv := viewerPresenceKey(accountID, r.Collection, r.DocID)
		kw := waitlistKey(accountID, r.Collection, r.DocID)

		get[i] = pipe.Get(ctx, k)
		zrem[i] = pipe.ZRemRangeByScore(ctx, kv, "0", nowScore)
		zcard[i] = pipe.ZCard(ctx, kv)
		llen[i] = pipe.LLen(ctx, kw)
	}

	// `redis.Nil` from any GET surfaces as the pipeline's overall error —
	// it's expected when one of the queried locks doesn't exist, so we
	// suppress it here and check each command's own .Err() below.
	if _, err := pipe.Exec(ctx); err != nil && err != redis.Nil {
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
			if jerr := json.Unmarshal([]byte(raw), &lr); jerr == nil {
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
			for k, v := range LockPayload(rec.ExpiresAtUnix) {
				payload[k] = v
			}
			payload["held"] = true
			payload["holderSessionID"] = rec.HolderSessionID
			payload["extendCount"] = rec.ExtendCount
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
		delPipe := rdb.Pipeline()
		for _, r := range expired {
			_ = delPipe.Del(ctx, LockKey(accountID, r.Collection, r.DocID))
		}
		_, _ = delPipe.Exec(ctx)
	}

	return results, nil
}

// readPipelineLock pulls the record from an already-executed GET. Returns
// ("", nil) when the key doesn't exist; ("", err) for true Redis errors —
// `redis.Nil` is mapped to the "not present" case.
func readPipelineLock(getCmd *redis.StringCmd) (string, error) {
	v, err := getCmd.Result()
	if err == redis.Nil {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	return v, nil
}
