package doclocklogic

import (
	"context"
	"errors"
	"fmt"

	"eve-industry-planner/shared/core/documentlock"

	"github.com/redis/go-redis/v9"
)

// BatchResult is the adapter outcome for lock-state-batch (success or classified failure).
type BatchResult struct {
	RequestID     string
	JobDocCount   int
	GroupDocCount int
	JobResults    map[string]any
	GroupResults  map[string]any
	// AckOK / AckErrMsg drive the document_lock_lock_state_batch_ack payload.
	AckOK     bool
	AckErrMsg string
	// Log failure (empty FailureClass on success).
	LogMsg       string
	FailureClass string
	Extra        map[string]any
}

func (r BatchResult) OK() bool {
	return r.FailureClass == ""
}

// RunLockStateBatch loads lock status maps for the parsed request.
// Caller must have a non-nil Redis for the success path; nil Redis yields unavailable.
func RunLockStateBatch(ctx context.Context, rdb *redis.Client, accountID string, req LockStateBatchRequest) BatchResult {
	base := BatchResult{
		RequestID:     req.RequestID,
		JobDocCount:   len(req.JobDocIDs),
		GroupDocCount: len(req.GroupDocIDs),
	}
	if rdb == nil {
		base.AckOK = false
		base.AckErrMsg = "service unavailable"
		base.LogMsg = "document locks unavailable"
		base.FailureClass = documentlock.FailureUnavailable
		return base
	}
	jobResults, groupResults, err := documentlock.StatusBatchResults(ctx, rdb, accountID, req.JobDocIDs, req.GroupDocIDs)
	if err != nil {
		base.AckOK = false
		switch {
		case errors.Is(err, documentlock.ErrStatusBatchEmpty):
			base.AckErrMsg = documentlock.ErrStatusBatchEmpty.Error()
			base.LogMsg = "document lock state batch: empty request"
			base.FailureClass = documentlock.FailureStateBatchEmpty
		case errors.Is(err, documentlock.ErrStatusBatchTooMany):
			base.AckErrMsg = documentlock.ErrStatusBatchTooMany.Error()
			base.LogMsg = fmt.Sprintf("document lock state batch: too many doc ids (max %d each)", documentlock.MaxStatusBatchDocs)
			base.FailureClass = documentlock.FailureStateBatchTooMany
		case errors.Is(err, documentlock.ErrLocksUnavailable):
			base.AckErrMsg = "locks unavailable"
			base.LogMsg = "document locks unavailable"
			base.FailureClass = documentlock.FailureUnavailable
		default:
			base.AckErrMsg = "internal error"
			base.LogMsg = "document lock state batch failed"
			base.FailureClass = documentlock.FailureStateBatchFailed
			base.Extra = map[string]any{"error": err.Error()}
		}
		return base
	}
	base.AckOK = true
	base.JobResults = jobResults
	base.GroupResults = groupResults
	return base
}
