package documentlocks

import (
	"context"
	"net/http"
	"strconv"
	"time"

	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/shared"

	"github.com/redis/go-redis/v9"
)

// ViewerPresenceTTL is the maximum age of a viewer-presence entry without a refresh
// before it's evicted by `pruneAndCountViewers`. We don't pulse viewer presence
// (client cleans up on unmount via /viewer-departed, or via `navigator.sendBeacon` on
// tab close), so this TTL is the safety net for tabs that crash or fail to send the
// departure.
const ViewerPresenceTTL = 5 * time.Minute

const viewerPresencePrefix = "doc_lock_viewers:v2:"

// LockViewerEventJoined / LockViewerEventLeft tag the published presence events so
// clients can distinguish them from other `document_lock_*` notifications.
//
// Kept alongside the rest of the document-lock event constants in `events.go` — these
// two are declared here so they sit next to the viewer code that emits them.
const (
	LockViewerEventJoined = "document_lock_viewer_joined"
	LockViewerEventLeft   = "document_lock_viewer_left"
)

func viewerPresenceKey(accountID, collection, docID string) string {
	return viewerPresencePrefix + accountID + keyPartSep + collection + keyPartSep + docID
}

// addViewer records `sessionID` as actively viewing the doc and returns whether the
// entry was newly created (so callers can avoid emitting a duplicate `viewer_joined`
// when a viewer re-mounts within the existing TTL window).
func addViewer(ctx context.Context, rdb *redis.Client, accountID, collection, docID, sessionID string) (newlyAdded bool, err error) {
	if rdb == nil || sessionID == "" {
		return false, nil
	}
	score := float64(time.Now().Add(ViewerPresenceTTL).Unix())
	added, err := rdb.ZAddArgs(ctx, viewerPresenceKey(accountID, collection, docID), redis.ZAddArgs{
		Members: []redis.Z{{Score: score, Member: sessionID}},
	}).Result()
	if err != nil {
		return false, err
	}
	return added > 0, nil
}

// removeViewer drops a viewer entry; returns whether the entry was present so callers
// can publish a `viewer_left` only on a real transition.
func removeViewer(ctx context.Context, rdb *redis.Client, accountID, collection, docID, sessionID string) (wasPresent bool, err error) {
	if rdb == nil || sessionID == "" {
		return false, nil
	}
	n, err := rdb.ZRem(ctx, viewerPresenceKey(accountID, collection, docID), sessionID).Result()
	if err != nil {
		return false, err
	}
	return n > 0, nil
}

// pruneAndCountViewers garbage-collects expired entries and returns the live viewer
// count for the doc. Cheap; `statusPayloadForDoc` calls this on every read so the
// count returned to clients is always fresh.
func pruneAndCountViewers(ctx context.Context, rdb *redis.Client, accountID, collection, docID string) (int64, error) {
	if rdb == nil {
		return 0, nil
	}
	k := viewerPresenceKey(accountID, collection, docID)
	nowScore := strconv.FormatInt(time.Now().Unix(), 10)
	pipe := rdb.Pipeline()
	_ = pipe.ZRemRangeByScore(ctx, k, "0", nowScore)
	countCmd := pipe.ZCard(ctx, k)
	if _, err := pipe.Exec(ctx); err != nil {
		return 0, err
	}
	return countCmd.Val(), nil
}

// handleViewerArrived records the caller as a passive viewer of `(collection, docID)`.
// Invoked by `useDocumentLock` when its scope state transitions to `readOnly: true`,
// so the current lock holder gets a `document_lock_viewer_joined` event and can
// surface the contention affordance even without an explicit Request access click.
func handleViewerArrived(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	hc, ok := lockHandlerContextOK(w, r, clients.Redis)
	if !ok {
		return
	}

	// Don't track holders as viewers — a transient readOnly burst during a sync
	// could otherwise leak the holder's own sessionID into the viewer count.
	rec, _ := getLock(hc.Ctx, hc.Redis, hc.AccountID, hc.Collection, hc.DocID)
	if rec != nil && rec.HolderSessionID == hc.SessionID {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	added, err := addViewer(hc.Ctx, hc.Redis, hc.AccountID, hc.Collection, hc.DocID, hc.SessionID)
	if err != nil {
		logs.WarnCtx(hc.Ctx, "doc lock viewer arrived: add failed",
			"error", err,
			"account_id", hc.AccountID,
			"collection", hc.Collection,
			"doc_id", hc.DocID,
		)
	}

	if added {
		_ = publishLockEvent(hc.Ctx, clients, hc.AccountID, map[string]any{
			"type":       LockViewerEventJoined,
			"collection": hc.Collection,
			"docID":      hc.DocID,
			"sessionID":  hc.SessionID,
		})
	}
	w.WriteHeader(http.StatusNoContent)
}

// handleViewerDeparted clears the caller's viewer entry. Called explicitly by
// `useDocumentLock` cleanup (unmount / readOnly→false) and via `navigator.sendBeacon`
// on tab unload so the holder's icon clears promptly instead of waiting for the
// `ViewerPresenceTTL` defensive sweep.
func handleViewerDeparted(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	hc, ok := lockHandlerContextOK(w, r, clients.Redis)
	if !ok {
		return
	}

	removed, err := removeViewer(hc.Ctx, hc.Redis, hc.AccountID, hc.Collection, hc.DocID, hc.SessionID)
	if err != nil {
		logs.WarnCtx(hc.Ctx, "doc lock viewer departed: remove failed",
			"error", err,
			"account_id", hc.AccountID,
			"collection", hc.Collection,
			"doc_id", hc.DocID,
		)
	}

	if removed {
		_ = publishLockEvent(hc.Ctx, clients, hc.AccountID, map[string]any{
			"type":       LockViewerEventLeft,
			"collection": hc.Collection,
			"docID":      hc.DocID,
			"sessionID":  hc.SessionID,
		})
	}
	w.WriteHeader(http.StatusNoContent)
}
