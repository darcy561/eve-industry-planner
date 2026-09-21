package commands

import (
	"context"
	"fmt"
	"strings"

	"eve-industry-planner/shared/models"
	"eve-industry-planner/shared/models/planner"
	eipmongo "eve-industry-planner/shared/mongo"
	"eve-industry-planner/shared/stackservices"

	"go.mongodb.org/mongo-driver/v2/bson"
	mongodriver "go.mongodb.org/mongo-driver/v2/mongo"
)

// settingsDocumentCollections are the two documents an owner's settings live in.
// Every release step that reshapes a settings document works over both, because
// both embed the same types and so hold the same shapes.
var settingsDocumentCollections = []string{
	eipmongo.CollectionAccountSettings,
	eipmongo.CollectionPlannerSettings,
}

// foldCustomStructures rewrites every settings document that still stores its
// custom structures as the four keyed lists, so that what is on disk is the one
// array the model holds.
//
// Reading already folds: models.CustomStructures.UnmarshalBSON accepts either
// shape, so nothing is broken before this runs and nothing breaks if it is run
// late. What it does not do is persist — a read hands its caller one array and
// leaves the document as it found it, so without this step the stored documents
// keep both shapes indefinitely and every reader pays the fold forever.
//
// The conversion is a decode and a write back rather than an aggregation: the
// decoder is the one place that knows how a legacy row without a jobType gets
// one, and a second implementation in a pipeline could disagree with it.
func foldCustomStructures(ctx context.Context, clients *stackservices.Clients, dryRun bool) (string, error) {
	if clients == nil || clients.Mongo == nil {
		return "", fmt.Errorf("mongo handle is required")
	}

	reports := make([]string, 0, len(settingsDocumentCollections))
	for _, name := range settingsDocumentCollections {
		report, err := foldCustomStructuresIn(ctx, clients.Mongo, name, dryRun)
		if err != nil {
			return "", err
		}
		reports = append(reports, report)
	}
	return strings.Join(reports, "; "), nil
}

func foldCustomStructuresIn(ctx context.Context, m *eipmongo.Mongo, collection string, dryRun bool) (string, error) {
	docs, err := customStructureDocs(m, collection)
	if err != nil {
		return "", err
	}
	coll := docs.Collection()
	if coll == nil {
		return "", fmt.Errorf("%s collection unavailable", collection)
	}

	// Selected by NOT already being an array, rather than by being the keyed
	// lists. A $type test against an array matches when any *element* has that
	// type, so asking for "object" matches a folded document too — every row in it
	// is one — and the step would rewrite the same documents on every run.
	owing := bson.M{"customStructures": bson.M{"$not": bson.M{"$type": "array"}}}
	ids, err := docs.DistinctStrings(ctx, "_id", owing)
	if err != nil {
		return "", fmt.Errorf("find %s owing a structure fold: %w", collection, err)
	}
	if len(ids) == 0 {
		return fmt.Sprintf("%s: none owes a fold", collection), nil
	}
	if dryRun {
		return fmt.Sprintf("%s: %d document(s) would be folded", collection, len(ids)), nil
	}

	for _, id := range ids {
		if err := foldOneSettingsDocument(ctx, m, collection, coll, id); err != nil {
			return "", err
		}
	}
	return fmt.Sprintf("%s: %d document(s) folded", collection, len(ids)), nil
}

// foldOneSettingsDocument decodes a document, which folds its structures, and
// writes only that field back.
//
// Only the one field: these documents are edited by their owner while a release
// runs against a live stack, and replacing the whole document would take every
// other field back to what it held when this step read it.
func foldOneSettingsDocument(ctx context.Context, m *eipmongo.Mongo, collection string, coll *mongodriver.Collection, id string) error {
	folded, err := decodeFoldedStructures(ctx, collection, coll, id)
	if err != nil {
		return err
	}
	if _, err := coll.UpdateOne(ctx, bson.M{"_id": id},
		bson.M{"$set": bson.M{"customStructures": folded}}); err != nil {
		return fmt.Errorf("write folded structures for %s %s: %w", collection, id, err)
	}
	return nil
}

// decodeFoldedStructures reads one document as its model type, which is what
// applies the fold, and returns the structures it now holds.
func decodeFoldedStructures(ctx context.Context, collection string, coll *mongodriver.Collection, id string) (models.CustomStructures, error) {
	filter := bson.M{"_id": id}
	switch collection {
	case eipmongo.CollectionAccountSettings:
		var doc models.ApplicationSettings
		if err := coll.FindOne(ctx, filter).Decode(&doc); err != nil {
			return nil, fmt.Errorf("read %s %s: %w", collection, id, err)
		}
		return doc.CustomStructures, nil
	case eipmongo.CollectionPlannerSettings:
		var doc planner.Settings
		if err := coll.FindOne(ctx, filter).Decode(&doc); err != nil {
			return nil, fmt.Errorf("read %s %s: %w", collection, id, err)
		}
		return doc.CustomStructures, nil
	}
	return nil, fmt.Errorf("no custom structure fold for collection %q", collection)
}

func customStructureDocs(m *eipmongo.Mongo, collection string) (*eipmongo.Docs, error) {
	switch collection {
	case eipmongo.CollectionAccountSettings:
		return m.ApplicationSettings, nil
	case eipmongo.CollectionPlannerSettings:
		return m.PlannerSettings, nil
	}
	return nil, fmt.Errorf("no custom structure fold for collection %q", collection)
}
