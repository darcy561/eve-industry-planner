package firestoremig

import (
	"context"
	"fmt"
	"time"

	mongocore "eve-industry-planner/shared/core/mongo"

	"cloud.google.com/go/firestore"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

const (
	// FirestoreUsersCollection is the top-level Firestore collection for app users.
	FirestoreUsersCollection = "Users"
	firestoreProfileInfoSub  = "ProfileInfo"
	firestoreWatchlistDocID  = "Watchlist"
)

// WatchlistFirestoreRef returns the Firestore document ref Users/{accountID}/ProfileInfo/Watchlist.
func WatchlistFirestoreRef(fs *firestore.Client, accountID string) *firestore.DocumentRef {
	return fs.Collection(FirestoreUsersCollection).Doc(accountID).Collection(firestoreProfileInfoSub).Doc(firestoreWatchlistDocID)
}

// UpsertUserWatchlistDeprecatedFromFirestore reads Firestore Users/{id}/ProfileInfo/Watchlist and upserts
// user_watchlist_deprecated. Returns migrated=true when a document was written, false when the Firestore
// watchlist doc is missing (same as worker: no error).
func UpsertUserWatchlistDeprecatedFromFirestore(ctx context.Context, fs *firestore.Client, m *mongo.Client, accountID string) (migrated bool, err error) {
	if accountID == "" {
		return false, fmt.Errorf("account_id is required")
	}
	if m == nil {
		return false, fmt.Errorf("mongo client is required")
	}

	snap, err := WatchlistFirestoreRef(fs, accountID).Get(ctx)
	if err != nil {
		return false, fmt.Errorf("get firestore watchlist: %w", err)
	}
	if !snap.Exists() {
		return false, nil
	}
	data := snap.Data()
	if data == nil {
		return false, nil
	}

	groups := normalizeFirestoreArrayField(data, "groups")
	items := normalizeFirestoreArrayField(data, "items")

	now := time.Now().UTC()
	doc := bson.M{
		"_id":    accountID,
		"groups": groups,
		"items":  items,
		"_meta": bson.M{
			"accountID":    accountID,
			"lastModified": now,
		},
	}

	db := m.Database(mongocore.DatabaseName)
	coll := db.Collection(mongocore.CollectionUserWatchlistDeprecated)

	retry := mongocore.DefaultRetryConfig()
	retry.OperationName = fmt.Sprintf("upsert watchlist deprecated (migration) %s", accountID)
	err = mongocore.RetryMongoOperation(ctx, retry, func() error {
		_, e := coll.ReplaceOne(ctx, bson.M{"_id": accountID}, doc, options.Replace().SetUpsert(true))
		return e
	})
	if err != nil {
		return false, fmt.Errorf("upsert watchlist deprecated: %w", err)
	}
	return true, nil
}

func normalizeFirestoreArrayField(m map[string]any, key string) any {
	v, ok := m[key]
	if !ok || v == nil {
		return bson.A{}
	}
	if arr, ok := v.([]any); ok {
		return toBSONArray(arr)
	}
	if arr, ok := v.([]interface{}); ok {
		return toBSONArray(arr)
	}
	return bson.A{}
}

func toBSONArray(v []any) bson.A {
	if len(v) == 0 {
		return bson.A{}
	}
	out := make(bson.A, len(v))
	for i, el := range v {
		out[i] = el
	}
	return out
}
