package commands

import (
	"context"
	"fmt"
	"strings"

	eipmongo "eve-industry-planner/shared/mongo"
	"eve-industry-planner/shared/stackservices"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// seedMarketLocationLane gives every settings document an empty market lane, so
// that an owner with no markets says so rather than saying nothing: a nil slice
// reaches a client as `null`, which is reserved for what is genuinely absent.
//
// A release step rather than a line in the upgrader, so the shape is fixed on
// disk once instead of repaired in memory on every read.
//
// Idempotent, and safe in any order: it selects what is not already an array,
// which catches a document that never had the field and one left holding `null`.
func seedMarketLocationLane(ctx context.Context, clients *stackservices.Clients, dryRun bool) (string, error) {
	if clients == nil || clients.Mongo == nil {
		return "", fmt.Errorf("mongo handle is required")
	}

	reports := make([]string, 0, len(settingsDocumentCollections))
	for _, name := range settingsDocumentCollections {
		report, err := seedMarketLocationLaneIn(ctx, clients.Mongo, name, dryRun)
		if err != nil {
			return "", err
		}
		reports = append(reports, report)
	}
	return strings.Join(reports, "; "), nil
}

func seedMarketLocationLaneIn(ctx context.Context, m *eipmongo.Mongo, collection string, dryRun bool) (string, error) {
	docs, err := customStructureDocs(m, collection)
	if err != nil {
		return "", err
	}
	coll := docs.Collection()
	if coll == nil {
		return "", fmt.Errorf("%s collection unavailable", collection)
	}

	owing := bson.M{"marketLocations": bson.M{"$not": bson.M{"$type": "array"}}}

	if dryRun {
		count, err := coll.CountDocuments(ctx, owing)
		if err != nil {
			return "", fmt.Errorf("count %s owing a market lane: %w", collection, err)
		}
		return fmt.Sprintf("%s: %d document(s) would be given a market lane", collection, count), nil
	}

	// One field, never the document: these are edited by their owner while a
	// release runs against a live stack, and writing the whole document would
	// take every other field back to what it held when this step read it.
	result, err := coll.UpdateMany(ctx, owing,
		bson.M{"$set": bson.M{"marketLocations": bson.A{}}})
	if err != nil {
		return "", fmt.Errorf("give %s a market lane: %w", collection, err)
	}
	return fmt.Sprintf("%s: %d document(s) given a market lane", collection, result.ModifiedCount), nil
}
