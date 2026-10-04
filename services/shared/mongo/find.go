package mongo

import (
	"context"

	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// findAll reads every document filter matches in d into a []T, retrying the query and the read of
// its results as one.
func findAll[T any](ctx context.Context, d *Docs, operationName string, filter any, opts ...options.Lister[options.FindOptions]) ([]T, error) {
	coll, err := d.requireColl()
	if err != nil {
		return nil, err
	}
	return RetryValue(ctx, operationName, func() ([]T, error) {
		cursor, err := coll.Find(ctx, filter, opts...)
		if err != nil {
			return nil, err
		}
		defer cursor.Close(ctx)
		var out []T
		if err := cursor.All(ctx, &out); err != nil {
			return nil, err
		}
		return out, nil
	})
}

// findOne reads the document filter matches in d into a T, answering mongo.ErrNoDocuments unchanged
// when none does.
func findOne[T any](ctx context.Context, d *Docs, operationName string, filter any, opts ...options.Lister[options.FindOneOptions]) (T, error) {
	coll, err := d.requireColl()
	if err != nil {
		var zero T
		return zero, err
	}
	return RetryValue(ctx, operationName, func() (T, error) {
		var out T
		err := coll.FindOne(ctx, filter, opts...).Decode(&out)
		return out, err
	})
}
