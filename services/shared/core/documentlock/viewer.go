package documentlock

import (
	"context"
	"strconv"
	"time"

	"eve-industry-planner/shared/logs"

	"github.com/redis/go-redis/v9"
)

// ViewerPresenceTTL is the maximum age of a viewer-presence entry without a refresh
// before it's evicted by PruneAndCountViewers.
const ViewerPresenceTTL = 5 * time.Minute

const viewerPresencePrefix = "doc_lock_viewers:"

// ViewerPresenceKey is the Redis ZSET of sessions passively viewing a doc.
func ViewerPresenceKey(accountID, collection, docID string) string {
	return viewerPresencePrefix + accountID + KeyPartSep + collection + KeyPartSep + docID
}

// AddViewer records sessionID as actively viewing the doc and returns whether the
// entry was newly created.
func AddViewer(ctx context.Context, rdb *redis.Client, accountID, collection, docID, sessionID string) (newlyAdded bool, err error) {
	if rdb == nil || sessionID == "" {
		return false, nil
	}
	score := float64(time.Now().Add(ViewerPresenceTTL).Unix())
	added, err := rdb.ZAddArgs(ctx, ViewerPresenceKey(accountID, collection, docID), redis.ZAddArgs{
		Members: []redis.Z{{Score: score, Member: sessionID}},
	}).Result()
	if err != nil {
		return false, err
	}
	return added > 0, nil
}

// RemoveViewer drops a viewer entry; returns whether the entry was present.
func RemoveViewer(ctx context.Context, rdb *redis.Client, accountID, collection, docID, sessionID string) (wasPresent bool, err error) {
	if rdb == nil || sessionID == "" {
		return false, nil
	}
	n, err := rdb.ZRem(ctx, ViewerPresenceKey(accountID, collection, docID), sessionID).Result()
	if err != nil {
		return false, err
	}
	return n > 0, nil
}

// StripPassiveViewerOnHolderGrant removes holderSessionID from the viewer registry
// when they become the editor (e.g. waitlist promotion after passive viewing).
// When publishLeft is true and an entry was removed, emits viewer_left so other
// sessions refresh viewerCount without treating the editor as a passive viewer.
func StripPassiveViewerOnHolderGrant(
	ctx context.Context,
	d Deps,
	accountID, collection, docID, holderSessionID string,
	publishLeft bool,
) {
	if d.Redis == nil || holderSessionID == "" || collection == "" || docID == "" {
		return
	}
	removed, err := RemoveViewer(ctx, d.Redis, accountID, collection, docID, holderSessionID)
	if err != nil {
		logs.WarnCtx(ctx, "doc lock holder grant: strip viewer failed",
			"error", err,
			"account_id", accountID,
			"collection", collection,
			"doc_id", docID,
		)
		return
	}
	if !removed || !publishLeft {
		return
	}
	_ = PublishLockEvent(ctx, d.JetStream, accountID, map[string]any{
		LockPayloadEventKey: LockViewerEventLeft,
		"collection":        collection,
		"docID":             docID,
		"sessionID":         holderSessionID,
	})
}

// PruneAndCountViewers garbage-collects expired entries and returns the live viewer count.
func PruneAndCountViewers(ctx context.Context, rdb *redis.Client, accountID, collection, docID string) (int64, error) {
	if rdb == nil {
		return 0, nil
	}
	k := ViewerPresenceKey(accountID, collection, docID)
	nowScore := strconv.FormatInt(time.Now().Unix(), 10)
	pipe := rdb.Pipeline()
	_ = pipe.ZRemRangeByScore(ctx, k, "0", nowScore)
	countCmd := pipe.ZCard(ctx, k)
	if _, err := pipe.Exec(ctx); err != nil {
		return 0, err
	}
	n := countCmd.Val()
	rec, _ := GetLock(ctx, rdb, accountID, collection, docID)
	if rec != nil && rec.HolderSessionID != "" {
		_, zerr := rdb.ZScore(ctx, k, rec.HolderSessionID).Result()
		if zerr == nil {
			n--
			if n < 0 {
				n = 0
			}
		}
	}
	return n, nil
}
