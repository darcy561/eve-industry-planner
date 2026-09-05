package mongo

import (
	"context"
	"fmt"
	"time"

	"eve-industry-planner/shared/models"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// GroupMembershipDelta lists job IDs newly present in IncludedJobIDs after a group upsert.
type GroupMembershipDelta struct {
	GroupID     string
	AddedJobIDs []string
}

// BulkUpsertGroupsResult aggregates BulkWrite counts plus membership diffs.
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

// BulkUpsertGroups runs one unordered BulkWrite for all groups (mongo.Groups).
// Membership deltas come from a pre-write Find of includedJobIDs (TOCTOU vs concurrent writers).
func (d *Docs) BulkUpsertGroups(ctx context.Context, accountID string, groups []models.Group, now time.Time, sessionID, wsClientID string) (*BulkUpsertGroupsResult, error) {
	coll, err := d.requireColl()
	if err != nil || accountID == "" {
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
		g.MetaData.Owner = models.AccountOwner(accountID)
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

	var bulkRes *mongo.BulkWriteResult
	err = Retry(ctx, "BulkUpsertGroups", func() error {
		prevByID := make(map[string][]string, len(ids))
		cur, ferr := coll.Find(ctx,
			bson.M{"_id": bson.M{"$in": ids}, FieldMetaOwnerID: accountID},
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
				SetFilter(bson.M{FieldMetaOwnerKind: models.OwnerAccount, FieldMetaOwnerID: accountID, "_id": g.GroupID}).
				SetUpdate(bson.M{"$set": g}).
				SetUpsert(true))
		}
		var opErr error
		bulkRes, opErr = coll.BulkWrite(ctx, bulkOps, options.BulkWrite().SetOrdered(false))
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
