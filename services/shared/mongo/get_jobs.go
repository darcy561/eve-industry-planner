package mongo

import (
	"context"
	"fmt"

	"eve-industry-planner/shared/models"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// LoadJobByID loads one job for an account (mongo.JobDocuments).
func (d *Docs) LoadJobByID(ctx context.Context, accountID, jobID string) (models.Job, error) {
	coll, err := d.requireColl()
	if err != nil || accountID == "" || jobID == "" {
		return models.Job{}, fmt.Errorf("LoadJobByID: invalid arguments")
	}
	filter := bson.M{"_meta.accountID": accountID, "_id": jobID}
	var doc models.Job
	if err := Retry(ctx, "LoadJobByID", func() error {
		return coll.FindOne(ctx, filter).Decode(&doc)
	}); err != nil {
		return models.Job{}, err
	}
	return doc, nil
}

// LoadJobsByFilter finds jobs for accountID matching filter, sorted by _meta.lastModified desc.
// Always scopes to _meta.accountID=accountID (merged into filter).
func (d *Docs) LoadJobsByFilter(ctx context.Context, accountID string, filter bson.M) ([]models.Job, error) {
	coll, err := d.requireColl()
	if err != nil || accountID == "" || filter == nil {
		return nil, fmt.Errorf("LoadJobsByFilter: invalid arguments")
	}
	scoped := mergeFilters(filter, bson.M{"_meta.accountID": accountID})
	var cursor *mongo.Cursor
	if err := Retry(ctx, "LoadJobsByFilter", func() error {
		var findErr error
		cursor, findErr = coll.Find(ctx, scoped, options.Find().SetSort(bson.M{"_meta.lastModified": -1}))
		return findErr
	}); err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)
	var jobs []models.Job
	if err := cursor.All(ctx, &jobs); err != nil {
		return nil, err
	}
	return jobs, nil
}
