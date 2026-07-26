package server

import (
	"context"
	"strings"
	"time"

	mongocore "eve-industry-planner/shared/core/mongo"
	"eve-industry-planner/shared/logs"
)

const docSubscribeMongoTimeout = 3 * time.Second

// docSubscribeAuthorized returns whether the account may subscribe or unsubscribe to docID
// in the form "{collection}.{mongoDocumentID}".
//
// Singleton collections (document id must equal accountID):
//   - users, application_settings, user_watchlist_deprecated — singleton per account; _id matches accountID (same invariant as login).
// Mongo ownership (_id + _meta.accountID == accountID):
//   - jobs, user_job_documents, archivedJobs, groups, build_stats
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
	case mongocore.CollectionUsers, mongocore.CollectionApplicationSettings, mongocore.CollectionUserWatchlistDeprecated:
		return id == accountID

	case mongocore.CollectionJobs, mongocore.CollectionUserJobDocuments, mongocore.CollectionArchivedJobs, mongocore.CollectionUserJobGroups, mongocore.CollectionBuildStats:
		if s.Stack == nil || s.Stack.Mongo == nil {
			logs.WarnCtx(context.Background(), "subscribe auth denied: mongo client unavailable",
				"collection", collection, "doc_id", id)
			return false
		}
		mctx, cancel := context.WithTimeout(ctx, docSubscribeMongoTimeout)
		defer cancel()
		coll := s.Stack.Mongo.Database(mongocore.DatabaseName).Collection(collection)
		ok, err := mongocore.DocumentExistsByID(mctx, coll, id, accountID)
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
