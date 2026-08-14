// cascade_pipeline.go contains the batched-pipeline implementation of the
// group → job lock cascade-release path.
//
// # What changed (vs. the previous per-job loop)
//
// The old implementation iterated `group.IncludedJobIDs`, calling
// `GetLock` (1+ RTTs) and `DeleteLock` (1 RTT) per job. For a group with
// 100 jobs that meant ~200 sequential Redis round-trips dominated by
// network latency.
//
// `pipelinedDecideAndReleaseJobLocks` collapses that into two pipelines:
//
//   - Phase 1: one pipeline that issues GET for every job ID. 1 round-trip.
//   - Phase 2: one pipeline that DELs only the locks the predicate chose
//     to release. 1 round-trip.
//
// Mongo IO and JetStream publishing stay outside the helper so the
// Redis-side logic can be unit-tested against miniredis.

package documentlock

import (
	"context"
	"encoding/json"
	"time"

	eipmongo "eve-industry-planner/shared/mongo"

	"github.com/redis/go-redis/v9"
)

// CascadeRelease describes one job lock that the cascade chose to force-
// release. The Redis DEL has already been issued by
// `pipelinedDecideAndReleaseJobLocks`; the caller is responsible for the
// corresponding JetStream `document_lock_released` event.
type CascadeRelease struct {
	JobID            string
	EvictedSessionID string
}

// pipelinedDecideAndReleaseJobLocks reads all job locks in one pipeline,
// runs `decide` against each non-expired record, then DELs the chosen ones
// in a second pipeline.
//
// Contract:
//   - Empty / blank job IDs are skipped before the pipeline so they don't
//     occupy slots in the response.
//   - Records whose JSON fails to parse are skipped (matches the previous
//     behaviour of `GetLock` swallowing decode errors at the cascade site
//     by returning ("", err) → predicate seeing nil).
//   - Expired records are treated as "no lock present" — the predicate
//     never sees them. The TTL subscriber handles their event.
//   - The phase-2 DEL pipeline is best-effort: even if it fails the
//     decided releases are returned so the caller can still publish the
//     JetStream events. The keys will TTL out independently.
//
// Returns the slice of decided releases (in the order their IDs appeared
// in the input) along with any fatal error from the read pipeline.
func pipelinedDecideAndReleaseJobLocks(
	ctx context.Context,
	rdb *redis.Client,
	accountID string,
	jobIDs []string,
	decide func(*LockRecord) (release bool, evictedSessionID string),
) ([]CascadeRelease, error) {
	if rdb == nil || decide == nil {
		return nil, nil
	}

	keep := make([]string, 0, len(jobIDs))
	for _, jobID := range jobIDs {
		if jobID != "" {
			keep = append(keep, jobID)
		}
	}
	if len(keep) == 0 {
		return nil, nil
	}

	pipe := rdb.Pipeline()
	get := make([]*redis.StringCmd, len(keep))
	for i, jobID := range keep {
		get[i] = pipe.Get(ctx, LockKey(accountID, eipmongo.CollectionUserJobDocuments, jobID))
	}
	if _, err := pipe.Exec(ctx); err != nil && err != redis.Nil {
		return nil, err
	}

	now := time.Now().Unix()
	releases := make([]CascadeRelease, 0, len(keep))

	for i, jobID := range keep {
		raw, err := readPipelineLock(get[i])
		if err != nil || raw == "" {
			continue
		}
		var rec LockRecord
		if jerr := json.Unmarshal([]byte(raw), &rec); jerr != nil {
			continue
		}
		if rec.ExpiresAtUnix > 0 && now > rec.ExpiresAtUnix {
			continue
		}
		release, evicted := decide(&rec)
		if !release {
			continue
		}
		releases = append(releases, CascadeRelease{JobID: jobID, EvictedSessionID: evicted})
	}

	if len(releases) == 0 {
		return nil, nil
	}

	delPipe := rdb.Pipeline()
	for _, r := range releases {
		_ = delPipe.Del(ctx, LockKey(accountID, eipmongo.CollectionUserJobDocuments, r.JobID))
	}
	if _, err := delPipe.Exec(ctx); err != nil {
		// Return the decided releases along with the error so the caller
		// can still publish events. The keys will TTL out either way.
		return releases, err
	}

	return releases, nil
}
