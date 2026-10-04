package mongo

import (
	"context"
	"fmt"

	"eve-industry-planner/shared/models"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// LoadGroupsForOwner loads every group in one planner (mongo.Groups).
func (d *Docs) LoadGroupsForOwner(ctx context.Context, owner models.Owner) ([]models.Group, error) {
	if owner.IsZero() {
		return nil, fmt.Errorf("LoadGroupsForOwner: invalid arguments")
	}
	return findAll[models.Group](ctx, d, "LoadGroupsForOwner", OwnerFilter(owner))
}

// LoadGroupByID loads one group from a planner.
func (d *Docs) LoadGroupByID(ctx context.Context, owner models.Owner, groupID string) (models.Group, error) {
	if owner.IsZero() || groupID == "" {
		return models.Group{}, fmt.Errorf("LoadGroupByID: invalid arguments")
	}
	return findOne[models.Group](ctx, d, "LoadGroupByID", bson.M{"_id": OwnerScopedDocumentID(owner, groupID)})
}
