package documentlock

import (
	"context"
	"strconv"
	"time"

	"github.com/redis/go-redis/v9"
)

// ViewerPresenceTTL is the maximum age of a viewer-presence entry without a refresh
// before it's evicted by PruneAndCountViewers.
const ViewerPresenceTTL = 5 * time.Minute

const viewerPresencePrefix = "doc_lock_viewers:"

func viewerPresenceKey(accountID, collection, docID string) string {
	return viewerPresencePrefix + accountID + KeyPartSep + collection + KeyPartSep + docID
}

// AddViewer records sessionID as actively viewing the doc and returns whether the
// entry was newly created.
func AddViewer(ctx context.Context, rdb *redis.Client, accountID, collection, docID, sessionID string) (newlyAdded bool, err error) {
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

// RemoveViewer drops a viewer entry; returns whether the entry was present.
func RemoveViewer(ctx context.Context, rdb *redis.Client, accountID, collection, docID, sessionID string) (wasPresent bool, err error) {
	if rdb == nil || sessionID == "" {
		return false, nil
	}
	n, err := rdb.ZRem(ctx, viewerPresenceKey(accountID, collection, docID), sessionID).Result()
	if err != nil {
		return false, err
	}
	return n > 0, nil
}

// PruneAndCountViewers garbage-collects expired entries and returns the live viewer count.
func PruneAndCountViewers(ctx context.Context, rdb *redis.Client, accountID, collection, docID string) (int64, error) {
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
