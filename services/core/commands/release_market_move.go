package commands

import (
	"context"
	"fmt"
	"strings"
	"time"

	"eve-industry-planner/shared/documentschema"
	"eve-industry-planner/shared/models"
	"eve-industry-planner/shared/models/planner"
	eipmongo "eve-industry-planner/shared/mongo"
	"eve-industry-planner/shared/stackservices"

	"go.mongodb.org/mongo-driver/v2/bson"
	mongodriver "go.mongodb.org/mongo-driver/v2/mongo"
)

// moveMarketsToTheirOwnLane rewrites every settings document that still stores a
// saved market among its custom structures, so that what is on disk is the
// market lane the model holds.
//
// Reading already moves them: every loader runs the schema upgrader, which lifts
// a market row out of `customStructures`, so nothing is broken before this runs
// and nothing breaks if it runs late. What it does not do is persist — a read
// hands its caller the moved rows and leaves the document as it found it — so
// without this every reader pays the move for ever and the stored documents keep
// both shapes.
//
// **A step rather than a schema bump.** The settings schema is not moving in
// this release, so `completeSchemaMaintenance` selects none of these documents:
// it takes what is below the current version, and they are all at it. A
// transform that moves the version needs no step of its own; one that does not,
// needs this.
//
// The conversion is a decode and a write back rather than an aggregation: the
// upgrader is the one place that knows which rows are markets and what a market
// row becomes, and a second implementation in a pipeline could disagree with it.
func moveMarketsToTheirOwnLane(ctx context.Context, clients *stackservices.Clients, dryRun bool) (string, error) {
	if clients == nil || clients.Mongo == nil {
		return "", fmt.Errorf("mongo handle is required")
	}

	reports := make([]string, 0, len(settingsDocumentCollections))
	for _, name := range settingsDocumentCollections {
		report, err := moveMarketsIn(ctx, clients.Mongo, name, dryRun)
		if err != nil {
			return "", err
		}
		reports = append(reports, report)
	}
	return strings.Join(reports, "; "), nil
}

func moveMarketsIn(ctx context.Context, m *eipmongo.Mongo, collection string, dryRun bool) (string, error) {
	docs, err := customStructureDocs(m, collection)
	if err != nil {
		return "", err
	}
	coll := docs.Collection()
	if coll == nil {
		return "", fmt.Errorf("%s collection unavailable", collection)
	}

	// A market still among the structures that this step can actually move.
	//
	// `$elemMatch`, so the kind and the place are read off the *same* element: a
	// document with one market and four build kinds is selected on the one that
	// matters, and one whose only market names nowhere is not selected at all.
	// `TakeMarketLocations` leaves that row where it is on purpose, so selecting
	// it would have the step report work on every run, for ever, against a
	// document it never changes.
	owing := bson.M{"customStructures": bson.M{"$elemMatch": bson.M{
		"jobType": models.StructureKindMarket,
		"$or": []bson.M{
			{"stationID": bson.M{"$gt": 0}},
			{"structureID": bson.M{"$gt": 0}},
		},
	}}}
	ids, err := docs.DistinctStrings(ctx, "_id", owing)
	if err != nil {
		return "", fmt.Errorf("find %s owing a market move: %w", collection, err)
	}
	if len(ids) == 0 {
		return fmt.Sprintf("%s: none owes a market move", collection), nil
	}
	if dryRun {
		return fmt.Sprintf("%s: %d document(s) would have markets moved", collection, len(ids)), nil
	}

	for _, id := range ids {
		if err := moveOneSettingsDocument(ctx, collection, coll, id); err != nil {
			return "", err
		}
	}
	return fmt.Sprintf("%s: %d document(s) had markets moved", collection, len(ids)), nil
}

// moveOneSettingsDocument decodes a document, which moves its markets, and
// writes back the two lanes.
//
// Those fields only: these documents are edited by their owner while a release
// runs against a live stack, and replacing the whole document would take every
// other field back to what it held when this step read it.
func moveOneSettingsDocument(ctx context.Context, collection string, coll *mongodriver.Collection, id string) error {
	moved, err := decodeMovedMarkets(ctx, collection, coll, id)
	if err != nil {
		return err
	}
	if _, err := coll.UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": moved}); err != nil {
		return fmt.Errorf("write moved markets for %s %s: %w", collection, id, err)
	}
	return nil
}

// decodeMovedMarkets reads one document and runs the upgrader over it, which is
// what applies the move, and returns the fields it changed.
//
// The upgrader rather than the decoder: a fold that rides `UnmarshalBSON`
// happens on the way in, but this move is a step in the upgrade and a plain
// decode here would write back exactly what it read.
func decodeMovedMarkets(ctx context.Context, collection string, coll *mongodriver.Collection, id string) (bson.M, error) {
	filter := bson.M{"_id": id}
	now := time.Now().UTC()

	switch collection {
	case eipmongo.CollectionAccountSettings:
		var doc models.ApplicationSettings
		if err := coll.FindOne(ctx, filter).Decode(&doc); err != nil {
			return nil, fmt.Errorf("read %s %s: %w", collection, id, err)
		}
		documentschema.Upgrader{}.ApplicationSettings(&doc, id, now)
		return bson.M{
			"customStructures": doc.CustomStructures,
			"marketLocations":  doc.MarketLocations,
		}, nil
	case eipmongo.CollectionPlannerSettings:
		var doc planner.Settings
		if err := coll.FindOne(ctx, filter).Decode(&doc); err != nil {
			return nil, fmt.Errorf("read %s %s: %w", collection, id, err)
		}
		documentschema.Upgrader{}.PlannerSettings(&doc)
		return bson.M{
			"customStructures": doc.CustomStructures,
			"marketLocations":  doc.MarketLocations,
		}, nil
	}
	return nil, fmt.Errorf("no market move for collection %q", collection)
}
