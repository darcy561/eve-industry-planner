package documentlocks

import (
	"context"
	"errors"

	mongocore "eve-industry-planner/shared/core/mongo"
	"eve-industry-planner/shared/shared"
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

// StatusBatchResults builds jobResults and groupResults maps (same payload as POST /document-locks/status-batch).
func StatusBatchResults(ctx context.Context, clients *shared.ServiceClients, accountID string, jobDocIDs, groupDocIDs []string) (jobResults map[string]any, groupResults map[string]any, err error) {
	if clients == nil || clients.Redis == nil {
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
		payload, e := statusPayloadForDoc(ctx, clients, accountID, mongocore.CollectionUserJobDocuments, docID)
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
		payload, e := statusPayloadForDoc(ctx, clients, accountID, mongocore.CollectionUserJobGroups, docID)
		if e != nil {
			return nil, nil, e
		}
		groupResults[docID] = payload
	}
	return jobResults, groupResults, nil
}
