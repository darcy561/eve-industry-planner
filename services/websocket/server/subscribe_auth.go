package server

import (
	"context"
	"errors"
	"strings"
	"time"

	"eve-industry-planner/shared/logs"
	eipmongo "eve-industry-planner/shared/mongo"

	"go.mongodb.org/mongo-driver/v2/bson"
	mongodriver "go.mongodb.org/mongo-driver/v2/mongo"
)

const docSubscribeMongoTimeout = 3 * time.Second

// docSubscribeAuthorized returns whether the account may subscribe or unsubscribe to docID
// in the form "{collection}.{mongoDocumentID}".
//
// Singleton collections (document id must equal accountID):
//   - accounts, account_settings, watchlist_deprecated — singleton per account; _id matches accountID (same invariant as login).
//
// Mongo ownership (_id + _meta.accountID == accountID):
//   - jobs, job_documents, archived_jobs, groups, production_totals
//
// All other collection names are denied (fail closed). Public/static collections (e.g. blueprints) must not
// be subscribed via this realtime channel.
func (s *Server) docSubscribeAuthorized(ctx context.Context, docID, accountID string) bool {
	if docID == "" || accountID == "" {
		return false
	}
	parts := strings.SplitN(docID, ".", 2)
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return false
	}
	collection, id := parts[0], parts[1]

	switch collection {
	case eipmongo.CollectionAccounts, eipmongo.CollectionAccountSettings, eipmongo.CollectionWatchlistDeprecated:
		return id == accountID

	case eipmongo.CollectionJobs, eipmongo.CollectionJobDocuments, eipmongo.CollectionJobGroups:
		if s.Stack == nil || s.Stack.Mongo == nil {
			logs.WarnCtx(context.Background(), "subscribe auth denied: mongo client unavailable",
				"collection", collection, "doc_id", id)
			return false
		}
		mongo := s.Stack.Mongo
		mctx, cancel := context.WithTimeout(ctx, docSubscribeMongoTimeout)
		defer cancel()
		coll := mongo.Coll(collection)
		ok, err := documentExistsByAccountID(mctx, coll, id, accountID)
		if err != nil {
			logs.WarnCtx(context.Background(), "subscribe auth mongo lookup failed",
				"error", err, "collection", collection, "doc_id", id, "account_id", accountID)
			return false
		}
		return ok

	default:
		return false
	}
}

func documentExistsByAccountID(ctx context.Context, coll *mongodriver.Collection, docID, accountID string) (bool, error) {
	if coll == nil {
		return false, nil
	}
	err := coll.FindOne(ctx, bson.M{
		"_id":             docID,
		"_meta.accountID": accountID,
	}).Err()
	if err == nil {
		return true, nil
	}
	if errors.Is(err, mongodriver.ErrNoDocuments) {
		return false, nil
	}
	return false, err
}
