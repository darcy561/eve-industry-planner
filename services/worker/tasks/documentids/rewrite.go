// Package documentids holds the worker side of the document id rewrite: moving
// planner-held documents onto ids that carry their owner.
package documentids

import (
	"context"
	"fmt"
	"maps"
	"slices"
	"strings"

	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"
	eipnats "eve-industry-planner/shared/nats"
	"eve-industry-planner/worker/taskrun"

	"go.mongodb.org/mongo-driver/v2/bson"
	mongodriver "go.mongodb.org/mongo-driver/v2/mongo"
)

// RewriteOwnerScopedIDs moves one owner's documents in one collection onto ids
// that carry the owner.
//
// `_id` cannot be updated, so each document is inserted under its new id and the
// old one removed. Insert first: a process that dies between the two leaves the
// document under both ids, which a re-run resolves, where the reverse order
// would lose it.
//
// Re-running is safe and is how progress is measured: a document whose id
// already names its owner is not selected.
func RewriteOwnerScopedIDs(ctx context.Context, payload eipnats.RewriteOwnerScopedIDsRequest, deps *taskrun.Dependencies) error {
	if deps == nil || deps.Mongo == nil {
		return fmt.Errorf("mongo client is required")
	}

	payload.Collection = strings.TrimSpace(payload.Collection)
	if !slices.Contains(eipmongo.OwnerScopedIDCollections(), payload.Collection) {
		return fmt.Errorf("collection %q holds no owner-scoped ids", payload.Collection)
	}
	owner, err := models.ParseOwnerKey(strings.TrimSpace(payload.OwnerKey))
	if err != nil {
		return fmt.Errorf("owner_key: %w", err)
	}

	coll := deps.Mongo.Coll(payload.Collection)
	if coll == nil {
		return fmt.Errorf("collection %q is not available", payload.Collection)
	}

	cursor, err := coll.Find(ctx, bson.M{
		eipmongo.FieldMetaOwnerKind: owner.Kind,
		eipmongo.FieldMetaOwnerID:   owner.ID,
	})
	if err != nil {
		return fmt.Errorf("read %s for %s: %w", payload.Collection, owner.Key(), err)
	}
	defer cursor.Close(ctx)

	var scanned, moved, alreadyMoved, skipped int
	for cursor.Next(ctx) {
		var doc bson.M
		if decErr := cursor.Decode(&doc); decErr != nil {
			logs.WarnCtx(ctx, "document id rewrite: decode failed",
				"collection", payload.Collection, "owner", owner.Key(), "error", decErr)
			skipped++
			continue
		}
		scanned++

		storedID, ok := doc["_id"].(string)
		if !ok || storedID == "" {
			// An id that is not a string is not one this rewrite can compose.
			skipped++
			continue
		}
		if !eipmongo.NeedsOwnerScopedID(storedID) {
			alreadyMoved++
			continue
		}
		if payload.DryRun {
			moved++
			continue
		}

		if err := moveDocument(ctx, coll, doc, eipmongo.OwnerScopedDocumentID(owner, storedID)); err != nil {
			logs.WarnCtx(ctx, "document id rewrite: leaving the document where it is",
				"collection", payload.Collection, "owner", owner.Key(),
				"doc_id", storedID, "error", err)
			skipped++
			continue
		}
		moved++
	}
	if err := cursor.Err(); err != nil {
		return fmt.Errorf("iterate %s for %s: %w", payload.Collection, owner.Key(), err)
	}

	logs.InfoCtx(ctx, "document id rewrite complete",
		"collection", payload.Collection,
		"owner", owner.Key(),
		"scanned", scanned,
		"moved", moved,
		"already_moved", alreadyMoved,
		"skipped", skipped,
		"dry_run", payload.DryRun)
	return nil
}

// moveDocument writes one document under newID and removes the old one.
//
// A duplicate key means a previous run inserted the new document and died before
// removing the old: the move is already done, so the delete finishes it.
func moveDocument(ctx context.Context, coll *mongodriver.Collection, doc bson.M, newID string) error {
	if newID == "" {
		return fmt.Errorf("document id would be empty")
	}
	oldID := doc["_id"]

	moved := make(bson.M, len(doc))
	maps.Copy(moved, doc)
	moved["_id"] = newID
	eipmongo.SeedDocumentRevision(moved)

	if _, err := coll.InsertOne(ctx, moved); err != nil && !mongodriver.IsDuplicateKeyError(err) {
		return fmt.Errorf("insert under %s: %w", newID, err)
	}
	if _, err := coll.DeleteOne(ctx, bson.M{"_id": oldID}); err != nil {
		return fmt.Errorf("remove %v: %w", oldID, err)
	}
	return nil
}
