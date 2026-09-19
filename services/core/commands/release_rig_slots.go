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

// rigSlotPair is the two rigs a stored rigID stood for.
//
// A structure carries two rig slots, but a setup stored one id chosen from a
// table whose entries were pre-combined pairs — "T1 - ME & TE" and the rest. The
// pair is what that id meant, and it is fixed: the bonuses each combined entry
// carried decompose into exactly one pair of atomic rigs, per axis.
type rigSlotPair struct {
	Slot1 int
	Slot2 int
}

// rigSlotsByStoredID is the whole conversion.
//
// Ids 0-4 named one rig already and keep it, with the second slot empty. Ids 5-8
// named a combination and become the two rigs it stood for. Id 9 is the faction
// rig, which beats any T2 on material and so never decomposed — it stays one rig
// in one slot.
//
// Manufacturing and reaction shared these ids entry for entry, so one table
// serves both and the step never asks which kind a setup is.
var rigSlotsByStoredID = map[int]rigSlotPair{
	0: {0, 0},
	1: {1, 0},
	2: {2, 0},
	3: {3, 0},
	4: {4, 0},
	5: {1, 3},
	6: {2, 4},
	7: {1, 4},
	8: {2, 3},
	9: {9, 0},
}

// rigSlotCollections are the collections holding a setup that names a rig.
var rigSlotCollections = []string{
	eipmongo.CollectionJobDocuments,
	eipmongo.CollectionJobs,
	eipmongo.CollectionArchivedJobs,
	eipmongo.CollectionGroupTemplatePayloads,
}

// foldRigSlots rewrites every stored setup that names its rig by a combined id,
// so a setup carries the two rig slots a structure actually has.
//
// The rig tables lost their combined entries, so a setup still naming one reads
// back no rig at all — `getRigInfoFromID` finds nothing and the material and time
// bonuses read zero. That is silent: a job simply costs more than it should. This
// is what closes that for the stored rows.
//
// Setups are walked as raw documents rather than decoded into models, because a
// job document holds more shapes than one release's model knows about and
// decoding would rewrite fields this step has no business touching.
func foldRigSlots(ctx context.Context, clients *stackservices.Clients, dryRun bool) (string, error) {
	if clients == nil || clients.Mongo == nil {
		return "", fmt.Errorf("mongo handle is required")
	}

	reports := make([]string, 0, len(rigSlotCollections))
	for _, name := range rigSlotCollections {
		report, err := foldRigSlotsIn(ctx, clients.Mongo, name, dryRun)
		if err != nil {
			return "", err
		}
		reports = append(reports, report)
	}
	return strings.Join(reports, "; "), nil
}

func foldRigSlotsIn(ctx context.Context, m *eipmongo.Mongo, collection string, dryRun bool) (string, error) {
	coll := m.Coll(collection)
	if coll == nil {
		return "", fmt.Errorf("%s collection unavailable", collection)
	}

	cursor, err := coll.Find(ctx, bson.M{})
	if err != nil {
		return "", fmt.Errorf("read %s for a rig fold: %w", collection, err)
	}
	defer cursor.Close(ctx)

	var converted, setups int
	for cursor.Next(ctx) {
		var doc bson.M
		if err := cursor.Decode(&doc); err != nil {
			return "", fmt.Errorf("decode a %s document: %w", collection, err)
		}

		changed := foldRigSlotsInDocument(collection, doc)
		if changed == 0 {
			continue
		}
		converted++
		setups += changed

		if dryRun {
			continue
		}
		if err := writeFoldedRigSlots(ctx, coll, collection, doc); err != nil {
			return "", err
		}
	}
	if err := cursor.Err(); err != nil {
		return "", fmt.Errorf("iterate %s for a rig fold: %w", collection, err)
	}

	if converted == 0 {
		return fmt.Sprintf("%s: none owes a rig fold", collection), nil
	}
	verb := "folded"
	if dryRun {
		verb = "would be folded"
	}
	return fmt.Sprintf("%s: %d setup(s) across %d document(s) %s",
		collection, setups, converted, verb), nil
}

// writeFoldedRigSlots writes back only the field holding the setups, so a
// release running against a live stack does not take every other field back to
// what it held when this step read the document.
func writeFoldedRigSlots(ctx context.Context, coll *mongodriver.Collection, collection string, doc bson.M) error {
	field := "build"
	value := doc["build"]
	if collection == eipmongo.CollectionGroupTemplatePayloads {
		field = "jobs"
		value = doc["jobs"]
	}

	if _, err := coll.UpdateOne(ctx, bson.M{"_id": doc["_id"]},
		bson.M{"$set": bson.M{field: value}}); err != nil {
		return fmt.Errorf("write folded rig slots for %s %v: %w", collection, doc["_id"], err)
	}
	return nil
}

// foldRigSlotsInDocument converts every setup the document holds, returning how
// many it changed.
func foldRigSlotsInDocument(collection string, doc bson.M) int {
	if collection == eipmongo.CollectionGroupTemplatePayloads {
		var changed int
		for _, node := range asArray(doc["jobs"]) {
			for _, setup := range asArray(asDocument(node)["presetSetups"]) {
				if foldSetupRig(asDocument(setup)) {
					changed++
				}
			}
		}
		return changed
	}

	var changed int
	for _, setup := range asDocument(asDocument(doc["build"])["setup"]) {
		if foldSetupRig(asDocument(setup)) {
			changed++
		}
	}
	return changed
}

// foldSetupRig replaces a setup's rigID with the two slots it stood for, and
// reports whether it changed anything.
//
// A setup already carrying slots is left alone, which is what makes the step
// safe to re-run and safe to run late.
func foldSetupRig(setup bson.M) bool {
	if setup == nil {
		return false
	}
	if _, held := setup["rigSlot1"]; held {
		return false
	}

	raw, held := setup["rigID"]
	if !held {
		return false
	}
	storedID := int(asInt64(raw))
	// An id the table does not know about is left as it is rather than guessed
	// at: it would be a rig from a shape nothing in this release wrote.
	pair, known := rigSlotsByStoredID[storedID]
	if !known {
		return false
	}

	setup["rigSlot1"] = pair.Slot1
	setup["rigSlot2"] = pair.Slot2
	delete(setup, "rigID")
	return true
}
