package commands

import (
	"context"
	"fmt"
	"strings"

	eipmongo "eve-industry-planner/shared/mongo"
	"eve-industry-planner/shared/stackservices"

	"go.mongodb.org/mongo-driver/v2/bson"
	mongodriver "go.mongodb.org/mongo-driver/v2/mongo"
)

// foldStructureRigSlots rewrites a saved structure's single rigType as the two
// rig slots it stood for.
//
// A structure carries two rig slots. Manufacturing and reaction structures used
// to carry one id chosen from a table of pre-combined pairs, exactly as a job
// setup did, and `rigSlotsByStoredID` is that same conversion — the two tables
// shared their ids entry for entry, so one table serves setups and structures
// both.
//
// Without this, an affected structure reads back with no rigs at all: nothing in
// the SPA reads rigType any more, so both slots answer zero and every material
// and time bonus that structure gives silently becomes zero. The stored value
// survives until its owner saves the structure, at which point the two zeroed
// slots are written over it, so each unconverted row has a deadline rather than
// merely a fault.
//
// Structures are walked as raw documents rather than decoded into models. The
// model no longer names every field a stored row can carry, and decoding would
// write this step's idea of the shape over fields it has no business touching.
func foldStructureRigSlots(ctx context.Context, clients *stackservices.Clients, dryRun bool) (string, error) {
	if clients == nil || clients.Mongo == nil {
		return "", fmt.Errorf("mongo handle is required")
	}

	reports := make([]string, 0, len(customStructureCollections))
	for _, name := range customStructureCollections {
		report, err := foldStructureRigSlotsIn(ctx, clients.Mongo, name, dryRun)
		if err != nil {
			return "", err
		}
		reports = append(reports, report)
	}
	return strings.Join(reports, "; "), nil
}

func foldStructureRigSlotsIn(ctx context.Context, m *eipmongo.Mongo, collection string, dryRun bool) (string, error) {
	docs, err := customStructureDocs(m, collection)
	if err != nil {
		return "", err
	}
	coll := docs.Collection()
	if coll == nil {
		return "", fmt.Errorf("%s collection unavailable", collection)
	}

	// Narrowed to documents already holding an array, because this runs after the
	// lane fold and a document still holding the four keyed lists is one that
	// fold could not move. What keeps such a document safe is the type assertion
	// in foldStructureRigSlotsInDocument, which a keyed-list document fails; this
	// filter saves reading it at all.
	owing := bson.M{"customStructures": bson.M{"$type": "array"}}
	cursor, err := coll.Find(ctx, owing)
	if err != nil {
		return "", fmt.Errorf("read %s for a structure rig fold: %w", collection, err)
	}
	defer cursor.Close(ctx)

	var converted, structures int
	for cursor.Next(ctx) {
		var doc bson.M
		if err := cursor.Decode(&doc); err != nil {
			return "", fmt.Errorf("decode a %s document: %w", collection, err)
		}

		rows, changed := foldStructureRigSlotsInDocument(doc)
		if changed == 0 {
			continue
		}
		converted++
		structures += changed

		if dryRun {
			continue
		}
		if err := writeFoldedStructureRigs(ctx, coll, collection, doc, rows); err != nil {
			return "", err
		}
	}
	if err := cursor.Err(); err != nil {
		return "", fmt.Errorf("iterate %s for a structure rig fold: %w", collection, err)
	}

	if converted == 0 {
		return fmt.Sprintf("%s: none owes a structure rig fold", collection), nil
	}
	verb := "folded"
	if dryRun {
		verb = "would be folded"
	}
	return fmt.Sprintf("%s: %d structure(s) across %d document(s) %s",
		collection, structures, converted, verb), nil
}

// foldStructureRigSlotsInDocument converts every structure the document holds
// and returns the rows to write back with the number that changed.
//
// A row counts as changed when anything about it moved, not only when it gained
// slots: dropping a stale rigType is a change the document has to be written
// back for, and counting only conversions would throw that deletion away with
// the document it was made in.
func foldStructureRigSlotsInDocument(doc bson.M) (bson.A, int) {
	rows, held := doc["customStructures"].(bson.A)
	if !held {
		return nil, 0
	}

	changed := 0
	for _, row := range rows {
		if foldStructureRig(asDocument(row)) {
			changed++
		}
	}
	return rows, changed
}

// foldStructureRig replaces one structure's rigType with the two slots it stood
// for, and reports whether it changed anything.
//
// A structure already carrying slots keeps them, which is what makes the step
// safe to re-run and safe to run late.
func foldStructureRig(structure bson.M) bool {
	if structure == nil {
		return false
	}
	if _, held := structure["rigSlot1"]; held {
		// A row carrying slots and a rigType is one the SPA wrote after the
		// change, over a value it never read. The stale rigType goes rather than
		// being kept as a second answer to the same question — and that deletion
		// is a change, so it is reported as one or the write never happens.
		_, stale := structure["rigType"]
		delete(structure, "rigType")
		return stale
	}

	raw, held := structure["rigType"]
	if !held {
		return false
	}
	// An id the table does not know about is left as it is rather than guessed
	// at: it would be a rig from a shape nothing in this release wrote.
	pair, known := rigSlotsByStoredID[int(asInt64(raw))]
	if !known {
		return false
	}

	structure["rigSlot1"] = pair.Slot1
	structure["rigSlot2"] = pair.Slot2
	delete(structure, "rigType")
	return true
}

// writeFoldedStructureRigs writes back only the structures field, so a release
// running against a live stack does not take every other field back to what it
// held when this step read the document.
func writeFoldedStructureRigs(
	ctx context.Context,
	coll *mongodriver.Collection,
	collection string,
	doc bson.M,
	rows bson.A,
) error {
	id, held := doc["_id"]
	if !held {
		return fmt.Errorf("a %s document has no _id", collection)
	}
	if _, err := coll.UpdateOne(ctx, bson.M{"_id": id},
		bson.M{"$set": bson.M{"customStructures": rows}}); err != nil {
		return fmt.Errorf("write folded structure rigs for %s %v: %w", collection, id, err)
	}
	return nil
}
