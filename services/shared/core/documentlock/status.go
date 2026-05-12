package documentlock

import (
	"context"
	"errors"

	mongocore "eve-industry-planner/shared/core/mongo"
	"eve-industry-planner/shared/logs"

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
)

// StatusPayloadForDoc builds one /lock-state row (same shape as HTTP lock-state-batch values).
func StatusPayloadForDoc(ctx context.Context, rdb *redis.Client, accountID, collection, docID string) (map[string]any, error) {
	rec, err := GetLock(ctx, rdb, accountID, collection, docID)
	if err != nil {
		return nil, err
	}
	viewerCount, vcErr := PruneAndCountViewers(ctx, rdb, accountID, collection, docID)
	if vcErr != nil {
		logs.WarnCtx(ctx, "doc lock viewer count failed", "error", vcErr)
	}
	if rec == nil {
		payload := map[string]any{"held": false}
		if vcErr == nil {
			payload["viewerCount"] = viewerCount
		}
		return payload, nil
	}
	payload := LockPayload(rec.ExpiresAtUnix)
	payload["held"] = true
	payload["holderSessionID"] = rec.HolderSessionID
	payload["extendCount"] = rec.ExtendCount
	if vcErr == nil {
		payload["viewerCount"] = viewerCount
	}
	wl, err := WaitlistLen(ctx, rdb, accountID, collection, docID)
	if err != nil {
		logs.WarnCtx(ctx, "doc lock waitlist len failed", "error", err)
	} else {
		payload["waitlistLen"] = wl
	}
	if rec.ProbeTargetSessionID != "" {
		payload["probeTargetSessionID"] = rec.ProbeTargetSessionID
		payload["probeExpiresAtUnix"] = rec.ProbeExpiresAtUnix
	}
	return payload, nil
}

// StatusBatchResults builds jobResults and groupResults maps (same payload as POST /document-locks/lock-state-batch).
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

	jobResults = make(map[string]any, len(jobDocIDs))
	for _, docID := range jobDocIDs {
		if docID == "" {
			continue
		}
		payload, e := StatusPayloadForDoc(ctx, rdb, accountID, mongocore.CollectionUserJobDocuments, docID)
		if e != nil {
			return nil, nil, e
		}
		jobResults[docID] = payload
	}
	groupResults = make(map[string]any, len(groupDocIDs))
	for _, docID := range groupDocIDs {
		if docID == "" {
			continue
		}
		payload, e := StatusPayloadForDoc(ctx, rdb, accountID, mongocore.CollectionUserJobGroups, docID)
		if e != nil {
			return nil, nil, e
		}
		groupResults[docID] = payload
	}
	return jobResults, groupResults, nil
}
