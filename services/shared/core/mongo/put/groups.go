package mongoput

import (
	"context"
	"fmt"
	"time"

	mongocore "eve-industry-planner/shared/core/mongo"
	"eve-industry-planner/shared/shared/models"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// GroupMembershipDelta lists job IDs newly present in IncludedJobIDs after a
// group upsert (next \ prev). Used to drive document-lock cascade on membership growth.
type GroupMembershipDelta struct {
	GroupID     string
	AddedJobIDs []string
}

// BulkUpsertGroupsResult aggregates counts from BulkWrite plus membership diffs.
type BulkUpsertGroupsResult struct {
	UpsertedCount int64
	ModifiedCount int64
	Deltas        []GroupMembershipDelta
	FailedCount   int
}

func diffAddedJobIDs(prev, next []string) []string {
	prevSet := make(map[string]struct{}, len(prev))
	for _, id := range prev {
		if id == "" {
			continue
		}
		prevSet[id] = struct{}{}
	}
	var out []string
	for _, id := range next {
		if id == "" {
			continue
		}
		if _, ok := prevSet[id]; ok {
			continue
		}
		out = append(out, id)
	}
	return out
}

// BulkUpsertGroups runs one unordered BulkWrite for all groups. Membership
// deltas use a pre-write Find (projection: includedJobIDs + _id) so AddedJobIDs
// = next \ prev with two Mongo round-trips per retry instead of N FindOneAndUpdates.
//
// There is a small TOCTOU window between the snapshot Find and BulkWrite: a
// concurrent writer could change IncludedJobIDs in between. That can only add
// spurious cascade work (over-eager eviction) or skip a cascade if the
// snapshot already contained a job the client is adding in this request — an
// edge case; FindOneAndUpdate-before per doc was strictly serial per document
// but still not a multi-document transaction.
func BulkUpsertGroups(ctx context.Context, collection *mongo.Collection, accountID string, groups []models.Group, now time.Time, sessionID, wsClientID string) (*BulkUpsertGroupsResult, error) {
	if collection == nil || accountID == "" {
		return nil, fmt.Errorf("BulkUpsertGroups: invalid arguments")
	}

	result := &BulkUpsertGroupsResult{}
	valid := make([]models.Group, 0, len(groups))
	for _, group := range groups {
		if group.GroupID == "" {
			result.FailedCount++
			continue
		}
		g := group
		g.MetaData.LastModified = now
		g.MetaData.LastUpdatedBy = accountID
		g.MetaData.AccountID = accountID
		ApplyMetaSessionClient(&g.MetaData.MetaData, sessionID, wsClientID)
		if g.MetaData.CreatedAt.IsZero() {
			g.MetaData.CreatedAt = now
		}
		g.AccountID = accountID
		valid = append(valid, g)
	}
	if len(valid) == 0 {
		return nil, nil
	}

	ids := make([]string, len(valid))
	for i := range valid {
		ids[i] = valid[i].GroupID
	}

	retryCfg := mongocore.DefaultRetryConfig()
	retryCfg.OperationName = fmt.Sprintf("bulk upsert %d groups", len(valid))

	var bulkRes *mongo.BulkWriteResult
	err := mongocore.RetryMongoOperation(ctx, retryCfg, func() error {
		prevByID := make(map[string][]string, len(ids))
		cur, ferr := collection.Find(ctx,
			bson.M{"_id": bson.M{"$in": ids}, "_meta.accountID": accountID},
			options.Find().SetProjection(bson.M{"includedJobIDs": 1, "_id": 1}),
		)
		if ferr != nil {
			return ferr
		}
		for cur.Next(ctx) {
			var doc struct {
				ID             string   `bson:"_id"`
				IncludedJobIDs []string `bson:"includedJobIDs"`
			}
			if derr := cur.Decode(&doc); derr != nil {
				_ = cur.Close(ctx)
				return derr
			}
			prevByID[doc.ID] = doc.IncludedJobIDs
		}
		if err := cur.Err(); err != nil {
			_ = cur.Close(ctx)
			return err
		}
		_ = cur.Close(ctx)

		bulkOps := make([]mongo.WriteModel, 0, len(valid))
		for _, g := range valid {
			bulkOps = append(bulkOps, mongo.NewUpdateOneModel().
				SetFilter(bson.M{"_id": g.GroupID, "_meta.accountID": accountID}).
				SetUpdate(bson.M{"$set": g}).
				SetUpsert(true))
		}
		var opErr error
		bulkRes, opErr = collection.BulkWrite(ctx, bulkOps, options.BulkWrite().SetOrdered(false))
		if opErr != nil {
			return opErr
		}

		lastByID := make(map[string]models.Group, len(valid))
		for _, g := range valid {
			lastByID[g.GroupID] = g
		}
		deltas := make([]GroupMembershipDelta, 0)
		for gid, g := range lastByID {
			prev := prevByID[gid]
			added := diffAddedJobIDs(prev, g.IncludedJobIDs)
			if len(added) > 0 {
				deltas = append(deltas, GroupMembershipDelta{GroupID: gid, AddedJobIDs: added})
			}
		}
		result.UpsertedCount = bulkRes.UpsertedCount
		result.ModifiedCount = bulkRes.ModifiedCount
		result.Deltas = deltas
		return nil
	})
	if err != nil {
		return nil, err
	}
	return result, nil
}
