package documentlock

import (
	"context"

	"eve-industry-planner/shared/logs"
)

// HandleViewerArrivedIngress mirrors POST /document-locks/viewer-arrived (Redis + optional NATS fan-out).
func HandleViewerArrivedIngress(ctx context.Context, d Deps, accountID, sessionID, collection, docID string) {
	if d.Redis == nil || sessionID == "" || collection == "" || docID == "" {
		return
	}

	rec, _ := GetLock(ctx, d.Redis, accountID, collection, docID)
	if rec != nil && rec.HolderSessionID == sessionID {
		return
	}

	added, err := AddViewer(ctx, d.Redis, accountID, collection, docID, sessionID)
	if err != nil {
		logs.WarnCtx(ctx, "doc lock viewer arrived: add failed",
			"error", err,
			"account_id", accountID,
			"collection", collection,
			"doc_id", docID,
		)
		return
	}

	// Any other session opening the doc (passive viewer) overrides solo lease,
	// same policy as waitlist pressure — holder moves to contested TTL + extend cycle.
	if added && rec != nil && rec.HolderSessionID != "" && rec.HolderSessionID != sessionID {
		if _, err := RebindHolderLeaseContested(ctx, d.Redis, accountID, collection, docID); err != nil {
			logs.WarnCtx(ctx, "doc lock viewer arrived: rebind contested failed",
				"error", err,
				"account_id", accountID,
				"collection", collection,
				"doc_id", docID,
			)
		}
	}

	if added {
		_ = PublishLockEvent(ctx, d.NATS, accountID, map[string]any{
			LockPayloadEventKey: LockViewerEventJoined,
			"collection":        collection,
			"docID":             docID,
			"sessionID":         sessionID,
		})
	}
}

// HandleViewerDepartedIngress mirrors POST /document-locks/viewer-departed.
// When the departing session is the current lock holder, we still ZREM their
// passive-viewer row (they may have been registered before promotion) but we
// do not publish viewer_left — other sessions would misread that as "someone
// stopped viewing" while that session is now the editor.
func HandleViewerDepartedIngress(ctx context.Context, d Deps, accountID, sessionID, collection, docID string) {
	if d.Redis == nil || sessionID == "" || collection == "" || docID == "" {
		return
	}

	rec, _ := GetLock(ctx, d.Redis, accountID, collection, docID)
	suppressViewerLeftFanout := rec != nil && rec.HolderSessionID == sessionID

	removed, err := RemoveViewer(ctx, d.Redis, accountID, collection, docID, sessionID)
	if err != nil {
		logs.WarnCtx(ctx, "doc lock viewer departed: remove failed",
			"error", err,
			"account_id", accountID,
			"collection", collection,
			"doc_id", docID,
		)
		return
	}

	if removed && !suppressViewerLeftFanout {
		_ = PublishLockEvent(ctx, d.NATS, accountID, map[string]any{
			LockPayloadEventKey: LockViewerEventLeft,
			"collection":        collection,
			"docID":             docID,
			"sessionID":         sessionID,
		})
	}

	if removed && rec != nil && rec.HolderSessionID != "" && rec.HolderSessionID != sessionID {
		if err := TryRebindHolderLeaseSoloIfUncontested(ctx, d.Redis, accountID, collection, docID); err != nil {
			logs.WarnCtx(ctx, "doc lock viewer departed: rebind solo failed",
				"error", err,
				"account_id", accountID,
				"collection", collection,
				"doc_id", docID,
			)
		}
	}
}
