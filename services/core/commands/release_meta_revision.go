package commands

import (
	"context"
	"fmt"

	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"
	"eve-industry-planner/shared/stackservices"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// ensureMetaRevision leaves every document the release touches carrying a write
// counter at `_meta.revision`, moved from `_meta.version` where there was one.
//
// Only the collections a user's writes reach. Anything a task reproduces —
// the SDE's blueprints, the statistics a recalculation rewrites — gets its
// counter from the write that reproduces it, which is a step of its own further
// down. Retired collections get nothing: `build_stats` is left behind for the
// recalculation to reproduce, and a counter on data nothing writes says the
// opposite of what is true.
//
// The counter says how many times a document has been written, which a
// conditional write compares; `version` read as the shape of the document, which
// is the model's own schema version and a different number entirely.
//
// A document written since the deploy already carries the new key. Renaming onto
// it would put the older count back, so those are left alone and their stale key
// removed instead.
//
// Anything left without a counter is seeded at the first revision. A document
// with no counter reads as zero and is matched by neither `{revision: 0}` nor an
// equality on what was read, so a conditional write would not conflict with it —
// it would never match it at all. Every document carrying a `_meta` block leaves
// this step with a revision.
func ensureMetaRevision(ctx context.Context, clients *stackservices.Clients, dryRun bool) (string, error) {
	var (
		renamed int64
		cleared int64
		seeded  int64
	)
	toRename := bson.M{
		"_meta.version":  bson.M{"$exists": true},
		"_meta.revision": bson.M{"$exists": false},
	}
	toClear := bson.M{
		"_meta.version":  bson.M{"$exists": true},
		"_meta.revision": bson.M{"$exists": true},
	}
	// Read after the rename has run for the collection, so it names only the
	// documents that never carried a counter under either key.
	toSeed := bson.M{
		"_meta":          bson.M{"$exists": true},
		"_meta.revision": bson.M{"$exists": false},
	}

	for _, name := range releaseTouchedCollections() {
		coll := clients.Mongo.Coll(name)

		pending, err := coll.CountDocuments(ctx, toRename)
		if err != nil {
			return "", fmt.Errorf("count %s: %w", name, err)
		}
		stale, err := coll.CountDocuments(ctx, toClear)
		if err != nil {
			return "", fmt.Errorf("count already-revised in %s: %w", name, err)
		}
		if dryRun {
			uncounted, cErr := coll.CountDocuments(ctx, toSeed)
			if cErr != nil {
				return "", fmt.Errorf("count uncounted in %s: %w", name, cErr)
			}
			renamed += pending
			cleared += stale
			// The rename covers some of them, so what is left to seed is the rest.
			seeded += uncounted - pending
			continue
		}
		if pending > 0 {
			res, uErr := coll.UpdateMany(ctx, toRename,
				bson.M{"$rename": bson.M{"_meta.version": eipmongo.FieldMetaRevision}})
			if uErr != nil {
				return "", fmt.Errorf("rename in %s: %w", name, uErr)
			}
			renamed += res.ModifiedCount
		}
		if stale > 0 {
			res, uErr := coll.UpdateMany(ctx, toClear,
				bson.M{"$unset": bson.M{"_meta.version": ""}})
			if uErr != nil {
				return "", fmt.Errorf("clear stale counter in %s: %w", name, uErr)
			}
			cleared += res.ModifiedCount
		}

		res, uErr := coll.UpdateMany(ctx, toSeed,
			bson.M{"$set": bson.M{eipmongo.FieldMetaRevision: models.InitialDocumentRevision}})
		if uErr != nil {
			return "", fmt.Errorf("seed counter in %s: %w", name, uErr)
		}
		seeded += res.ModifiedCount
	}

	return fmt.Sprintf("renamed %d, seeded %d, cleared %d already carrying the new key",
		renamed, seeded, cleared), nil
}
