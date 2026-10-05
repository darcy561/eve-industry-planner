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

// BulkUpsertGroupsResult counts what a group upsert wrote and what it refused.
type BulkUpsertGroupsResult struct {
	UpsertedCount int64
	ModifiedCount int64
	FailedCount   int
}

// BulkUpsertGroups runs one unordered BulkWrite for all groups (mongo.Groups).
func (d *Docs) BulkUpsertGroups(ctx context.Context, owner models.Owner, accountID string, groups []models.Group, now time.Time, sessionID, wsClientID string) (*BulkUpsertGroupsResult, error) {
	coll, err := d.requireColl()
	if err != nil || accountID == "" || owner.IsZero() {
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
		g.MetaData.Owner = owner
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

	bulkOps := make([]mongo.WriteModel, 0, len(valid))
	for _, g := range valid {
		update, uerr := SetDocumentWithRevision(g, nil)
		if uerr != nil {
			return nil, uerr
		}
		bulkOps = append(bulkOps, mongo.NewUpdateOneModel().
			SetFilter(bson.M{"_id": OwnerScopedDocumentID(owner, g.GroupID)}).
			SetUpdate(update).
			SetUpsert(true))
	}
	bulkRes, err := RetryValue(ctx, "BulkUpsertGroups", func() (*mongo.BulkWriteResult, error) {
		return coll.BulkWrite(ctx, bulkOps, options.BulkWrite().SetOrdered(false))
	})
	if err != nil {
		return nil, err
	}
	result.UpsertedCount = bulkRes.UpsertedCount
	result.ModifiedCount = bulkRes.ModifiedCount
	return result, nil
}
