package documentlock

import (
	"context"

	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/models"
)

// HandleViewerArrivedIngress records a viewer of a document and moves its holder to the contested lease.
func HandleViewerArrivedIngress(ctx context.Context, d Deps, owner models.Owner, sessionID, collection, docID string) {
	if d.Redis.Driver() == nil || sessionID == "" || collection == "" || docID == "" {
		return
	}

	rec, _ := GetLock(ctx, d.Redis, owner, collection, docID)
	if rec != nil && rec.HolderSessionID == sessionID {
		return
	}

	added, err := AddViewer(ctx, d.Redis, owner, collection, docID, sessionID)
	if err != nil {
		logs.WarnCtx(ctx, "doc lock viewer arrived: add failed",
			"error", err,
			"owner_key", owner.Key(),
			"collection", collection,
			"doc_id", docID,
		)
		return
	}

	if added && rec != nil && rec.HolderSessionID != "" && rec.HolderSessionID != sessionID {
		if _, err := RebindHolderLeaseContested(ctx, d.Redis, owner, collection, docID); err != nil {
			logs.WarnCtx(ctx, "doc lock viewer arrived: rebind contested failed",
				"error", err,
				"owner_key", owner.Key(),
				"collection", collection,
				"doc_id", docID,
			)
		}
	}

	if added {
		_ = PublishLockEvent(ctx, d.NATS, owner, map[string]any{
			LockPayloadEventKey:  LockViewerEventJoined,
			"collection":         collection,
			"docID":              docID,
			"participantID":      ParticipantID(sessionID),
			LockSourceSessionKey: sessionID,
		})
	}
}

// HandleViewerDepartedIngress removes a viewer of a document, publishing viewer_left
// unless the departing session holds the lock.
func HandleViewerDepartedIngress(ctx context.Context, d Deps, owner models.Owner, sessionID, collection, docID string) {
	if d.Redis.Driver() == nil || sessionID == "" || collection == "" || docID == "" {
		return
	}

	rec, _ := GetLock(ctx, d.Redis, owner, collection, docID)
	suppressViewerLeftFanout := rec != nil && rec.HolderSessionID == sessionID

	removed, err := RemoveViewer(ctx, d.Redis, owner, collection, docID, sessionID)
	if err != nil {
		logs.WarnCtx(ctx, "doc lock viewer departed: remove failed",
			"error", err,
			"owner_key", owner.Key(),
			"collection", collection,
			"doc_id", docID,
		)
		return
	}

	if removed && !suppressViewerLeftFanout {
		_ = PublishLockEvent(ctx, d.NATS, owner, map[string]any{
			LockPayloadEventKey:  LockViewerEventLeft,
			"collection":         collection,
			"docID":              docID,
			"participantID":      ParticipantID(sessionID),
			LockSourceSessionKey: sessionID,
		})
	}

	if removed && rec != nil && rec.HolderSessionID != "" && rec.HolderSessionID != sessionID {
		if err := TryRebindHolderLeaseSoloIfUncontested(ctx, d.Redis, owner, collection, docID); err != nil {
			logs.WarnCtx(ctx, "doc lock viewer departed: rebind solo failed",
				"error", err,
				"owner_key", owner.Key(),
				"collection", collection,
				"doc_id", docID,
			)
		}
	}
}
