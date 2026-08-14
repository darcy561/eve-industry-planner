package mongo

import (
	"context"
	"fmt"

	"eve-industry-planner/shared/models"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

// LoadGroupsByAccount loads all groups for an account (mongo.Groups).
func (d *Docs) LoadGroupsByAccount(ctx context.Context, accountID string) ([]models.Group, error) {
	coll, err := d.requireColl()
	if err != nil || accountID == "" {
		return nil, fmt.Errorf("LoadGroupsByAccount: invalid arguments")
	}
	filter := bson.M{"_meta.accountID": accountID}
	var cursor *mongo.Cursor
	if err := Retry(ctx, "LoadGroupsByAccount", func() error {
		var findErr error
		cursor, findErr = coll.Find(ctx, filter)
		return findErr
	}); err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)
	var groups []models.Group
	if err := cursor.All(ctx, &groups); err != nil {
		return nil, err
	}
	return groups, nil
}

// LoadGroupByID loads one group for an account.
func (d *Docs) LoadGroupByID(ctx context.Context, accountID, groupID string) (models.Group, error) {
	coll, err := d.requireColl()
	if err != nil || accountID == "" || groupID == "" {
		return models.Group{}, fmt.Errorf("LoadGroupByID: invalid arguments")
	}
	filter := bson.M{"_id": groupID, "_meta.accountID": accountID}
	var group models.Group
	if err := Retry(ctx, "LoadGroupByID", func() error {
		return coll.FindOne(ctx, filter).Decode(&group)
	}); err != nil {
		return models.Group{}, err
	}
	return group, nil
}
