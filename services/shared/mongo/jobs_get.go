package mongo

import (
	"context"
	"fmt"

	"eve-industry-planner/shared/models"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// LoadJobByID loads one job from a planner (mongo.JobDocuments).
func (d *Docs) LoadJobByID(ctx context.Context, owner models.Owner, jobID string) (models.Job, error) {
	if owner.IsZero() || jobID == "" {
		return models.Job{}, fmt.Errorf("LoadJobByID: invalid arguments")
	}
	return findOne[models.Job](ctx, d, "LoadJobByID", bson.M{"_id": OwnerScopedDocumentID(owner, jobID)})
}

// LoadJobsByFilter finds jobs in one planner matching filter, sorted by _meta.lastModified desc.
func (d *Docs) LoadJobsByFilter(ctx context.Context, owner models.Owner, filter bson.M) ([]models.Job, error) {
	if owner.IsZero() || filter == nil {
		return nil, fmt.Errorf("LoadJobsByFilter: invalid arguments")
	}
	return findAll[models.Job](ctx, d, "LoadJobsByFilter", mergeFilters(filter, OwnerFilter(owner)),
		options.Find().SetSort(bson.M{FieldMetaLastModified: -1}))
}
