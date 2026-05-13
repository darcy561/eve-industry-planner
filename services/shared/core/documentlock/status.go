package documentlock

import (
	"context"
	"errors"

	mongocore "eve-industry-planner/shared/core/mongo"

	"github.com/redis/go-redis/v9"
)

// MaxStatusBatchDocs is the maximum job or group IDs per batch (HTTP and WebSocket).
const MaxStatusBatchDocs = 500

var (
	// ErrStatusBatchEmpty is returned when both ID slices are empty.
	ErrStatusBatchEmpty = errors.New("jobDocIDs and groupDocIDs cannot both be empty")
	// ErrStatusBatchTooMany is returned when either slice exceeds MaxStatusBatchDocs.
	ErrStatusBatchTooMany = errors.New("status batch: too many doc ids")
	// ErrLocksUnavailable is returned when Redis is not configured.
	ErrLocksUnavailable = errors.New("locks unavailable")
	// ErrForceReleaseNoLock is returned when POST /force-release finds no active lock.
	ErrForceReleaseNoLock = errors.New("no active lock")
	// ErrForceReleaseSameSession is returned when the caller already holds the lock (use POST /release).
	ErrForceReleaseSameSession = errors.New("already holding lock; use release")
)

// StatusPayloadForDoc builds one /lock-state row (same shape as HTTP lock-state-batch values).
//
// This is a thin wrapper over `statusBatchFetch` so the single-doc and
// batch paths share one pipelined Redis read implementation.
func StatusPayloadForDoc(ctx context.Context, rdb *redis.Client, accountID, collection, docID string) (map[string]any, error) {
	results, err := statusBatchFetch(ctx, rdb, accountID, []statusDocRef{{Collection: collection, DocID: docID}})
	if err != nil {
		return nil, err
	}
	if len(results) == 0 {
		return map[string]any{"held": false}, nil
	}
	return results[0], nil
}

// StatusBatchResults builds jobResults and groupResults maps (same payload as POST /document-locks/lock-state-batch).
//
// All Redis reads for the entire batch run inside two pipelines (one per
// collection bucket) so the round-trip cost is O(1) in the batch size.
func StatusBatchResults(ctx context.Context, rdb *redis.Client, accountID string, jobDocIDs, groupDocIDs []string) (jobResults map[string]any, groupResults map[string]any, err error) {
	if rdb == nil {
		return nil, nil, ErrLocksUnavailable
	}
	if len(jobDocIDs) == 0 && len(groupDocIDs) == 0 {
		return nil, nil, ErrStatusBatchEmpty
	}
	if len(jobDocIDs) > MaxStatusBatchDocs || len(groupDocIDs) > MaxStatusBatchDocs {
		return nil, nil, ErrStatusBatchTooMany
	}

	jobResults, err = pipelinedStatusForCollection(ctx, rdb, accountID, mongocore.CollectionUserJobDocuments, jobDocIDs)
	if err != nil {
		return nil, nil, err
	}
	groupResults, err = pipelinedStatusForCollection(ctx, rdb, accountID, mongocore.CollectionUserJobGroups, groupDocIDs)
	if err != nil {
		return nil, nil, err
	}
	return jobResults, groupResults, nil
}

// pipelinedStatusForCollection runs one `statusBatchFetch` for the given
// collection bucket and rebuilds the docID→payload map the callers expect.
// Empty / blank doc IDs are filtered before the pipeline so they don't
// occupy slots in the response.
func pipelinedStatusForCollection(
	ctx context.Context,
	rdb *redis.Client,
	accountID, collection string,
	docIDs []string,
) (map[string]any, error) {
	out := make(map[string]any, len(docIDs))
	if len(docIDs) == 0 {
		return out, nil
	}

	refs := make([]statusDocRef, 0, len(docIDs))
	keep := make([]string, 0, len(docIDs))
	for _, docID := range docIDs {
		if docID == "" {
			continue
		}
		refs = append(refs, statusDocRef{Collection: collection, DocID: docID})
		keep = append(keep, docID)
	}
	if len(refs) == 0 {
		return out, nil
	}

	payloads, err := statusBatchFetch(ctx, rdb, accountID, refs)
	if err != nil {
		return nil, err
	}
	for i, docID := range keep {
		out[docID] = payloads[i]
	}
	return out, nil
}
