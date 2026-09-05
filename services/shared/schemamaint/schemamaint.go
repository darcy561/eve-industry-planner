// Package schemamaint brings stored documents up to the current schema version.
//
// Both the hourly maintenance rotation and the release migration need this, and
// a service may not import another's packages, so the work lives here rather
// than in either caller.
package schemamaint

import (
	"context"
	"fmt"
	"strings"
	"time"

	"eve-industry-planner/shared/documentschema"
	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// Summary reports one pass over a collection.
type Summary struct {
	Scanned  int
	Upgraded int
	Failed   int
	// Remaining is how many documents still sit below the current version. A
	// drain that stops with this above zero has found documents its upgrader
	// cannot move, which is the case worth reporting rather than looping on.
	Remaining int64
}

// Batch upgrades up to batchSize documents of one collection.
func Batch(ctx context.Context, docs *eipmongo.Docs, collection string, batchSize int) (Summary, error) {
	switch collection {
	case eipmongo.CollectionAccounts:
		return runBatch(ctx, docs, batchSize, models.UserAccountDocumentSchemaCurrent,
			func(d *models.UserAccountDocument) { documentschema.Upgrader{}.UserAccountDocument(d) },
			func(d models.UserAccountDocument) int { return d.SchemaVersion },
			func(d models.UserAccountDocument) string { return d.MetaData.AccountID })
	case eipmongo.CollectionAccountSettings:
		return runBatch(ctx, docs, batchSize, models.ApplicationSettingsSchemaCurrent,
			func(d *models.ApplicationSettings) {
				documentschema.Upgrader{}.ApplicationSettings(d, d.MetaData.AccountID, time.Now().UTC())
			},
			func(d models.ApplicationSettings) int { return d.SchemaVersion },
			func(d models.ApplicationSettings) string { return d.MetaData.AccountID })
	case eipmongo.CollectionJobDocuments, eipmongo.CollectionJobs, eipmongo.CollectionArchivedJobs:
		return runBatch(ctx, docs, batchSize, models.JobSchemaCurrent,
			func(d *models.Job) { documentschema.Upgrader{}.Job(d) },
			func(d models.Job) int { return d.SchemaVersion },
			func(d models.Job) string { return d.JobID })
	case eipmongo.CollectionJobGroups:
		return runBatch(ctx, docs, batchSize, models.GroupSchemaCurrent,
			func(d *models.Group) { documentschema.Upgrader{}.Group(d) },
			func(d models.Group) int { return d.SchemaVersion },
			func(d models.Group) string { return d.GroupID })
	default:
		return Summary{}, fmt.Errorf("schemamaint: unsupported collection %q", collection)
	}
}

// Drain upgrades a collection until a pass moves nothing.
//
// It stops on no progress rather than on an empty selection: a document the
// upgrader leaves at its old version stays selected, so a loop waiting for the
// selection to empty would never end. Remaining says whether the collection
// actually reached the current version.
func Drain(ctx context.Context, docs *eipmongo.Docs, collection string, batchSize int) (Summary, error) {
	var total Summary
	for {
		if err := ctx.Err(); err != nil {
			return total, err
		}
		pass, err := Batch(ctx, docs, collection, batchSize)
		if err != nil {
			return total, err
		}
		total.Scanned += pass.Scanned
		total.Upgraded += pass.Upgraded
		total.Failed += pass.Failed
		if pass.Upgraded == 0 {
			break
		}
	}
	remaining, err := countBelowCurrent(ctx, docs, collection)
	if err != nil {
		return total, err
	}
	total.Remaining = remaining
	return total, nil
}

func runBatch[T any](
	ctx context.Context,
	docs *eipmongo.Docs,
	batchSize, current int,
	apply func(*T),
	versionOf func(T) int,
	idOf func(T) string,
) (Summary, error) {
	col := docs.Collection()
	if col == nil {
		return Summary{}, fmt.Errorf("schemamaint: collection handle is required")
	}

	cursor, err := col.Find(ctx, belowCurrentFilter(current),
		options.Find().SetSort(bson.D{{Key: "_id", Value: 1}}).SetLimit(int64(batchSize)))
	if err != nil {
		return Summary{}, fmt.Errorf("query %s schema batch: %w", col.Name(), err)
	}
	defer cursor.Close(ctx)

	var summary Summary
	candidates := make([]eipmongo.StructUpsertItem, 0, batchSize)
	for cursor.Next(ctx) {
		var doc T
		if err := cursor.Decode(&doc); err != nil {
			continue
		}
		summary.Scanned++
		before := versionOf(doc)
		apply(&doc)
		if versionOf(doc) == before {
			continue
		}
		id := strings.TrimSpace(idOf(doc))
		if id == "" {
			continue
		}
		candidates = append(candidates, eipmongo.StructUpsertItem{DocID: id, Value: doc})
	}
	if err := cursor.Err(); err != nil {
		return summary, fmt.Errorf("iterate %s schema batch: %w", col.Name(), err)
	}
	if len(candidates) == 0 {
		return summary, nil
	}

	written, err := docs.UpsertStructsPreservingMetaBulk(ctx, candidates, batchSize)
	if err != nil {
		return summary, fmt.Errorf("%s schema bulk upsert: %w", col.Name(), err)
	}
	summary.Upgraded = written.Success
	summary.Failed = written.Failed
	return summary, nil
}

func belowCurrentFilter(current int) bson.M {
	return bson.M{"$or": []bson.M{
		{"schemaVersion": bson.M{"$lt": current}},
		{"schemaVersion": bson.M{"$exists": false}},
	}}
}

func countBelowCurrent(ctx context.Context, docs *eipmongo.Docs, collection string) (int64, error) {
	current, err := CurrentVersion(collection)
	if err != nil {
		return 0, err
	}
	col := docs.Collection()
	if col == nil {
		return 0, fmt.Errorf("schemamaint: collection handle is required")
	}
	return col.CountDocuments(ctx, belowCurrentFilter(current))
}

// CurrentVersion is the schema version a collection's documents should hold.
func CurrentVersion(collection string) (int, error) {
	switch collection {
	case eipmongo.CollectionAccounts:
		return models.UserAccountDocumentSchemaCurrent, nil
	case eipmongo.CollectionAccountSettings:
		return models.ApplicationSettingsSchemaCurrent, nil
	case eipmongo.CollectionJobDocuments, eipmongo.CollectionJobs, eipmongo.CollectionArchivedJobs:
		return models.JobSchemaCurrent, nil
	case eipmongo.CollectionJobGroups:
		return models.GroupSchemaCurrent, nil
	default:
		return 0, fmt.Errorf("schemamaint: unsupported collection %q", collection)
	}
}
