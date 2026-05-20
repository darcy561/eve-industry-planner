package mongo

import (
	"context"
	"fmt"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
)

// DeleteManyAfterStampingMeta runs UpdateMany with $set on _meta (lastModified, optional sessionID
// and clientID) for documents matching filter, then DeleteMany with the same filter, using
// RetryMongoOperation for transient errors.
//
// Stamping before remove ensures change-stream delete preimages (and NATS sourceClientID /
// sourceSessionID) reflect this delete request, not the last writer — so websocket echo suppression
// skips only the deleting tab, not other tabs on the same account.
//
// Returns the final DeletedCount from DeleteMany on success.
func DeleteManyAfterStampingMeta(ctx context.Context, retryCfg RetryConfig, collection *mongo.Collection, filter bson.M, now time.Time, sessionID, wsClientID string) (deletedCount int64, err error) {
	if collection == nil {
		return 0, fmt.Errorf("DeleteManyAfterStampingMeta: nil collection")
	}
	set := bson.M{"_meta.lastModified": now}
	if sessionID != "" {
		set["_meta.sessionID"] = sessionID
	}
	if wsClientID != "" {
		set["_meta.clientID"] = wsClientID
	}
	var result *mongo.DeleteResult
	err = RetryMongoOperation(ctx, retryCfg, func() error {
		if _, uerr := collection.UpdateMany(ctx, filter, bson.M{"$set": set}); uerr != nil {
			return uerr
		}
		var derr error
		result, derr = collection.DeleteMany(ctx, filter)
		return derr
	})
	if err != nil {
		return 0, err
	}
	if result == nil {
		return 0, nil
	}
	return result.DeletedCount, nil
}
