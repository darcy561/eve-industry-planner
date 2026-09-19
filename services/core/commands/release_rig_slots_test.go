package commands

import (
	"testing"

	eipmongo "eve-industry-planner/shared/mongo"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// The bonuses each stored id carried, as the rig tables held them before the
// combined entries were split. A pair has to give back exactly these, per axis,
// or a converted setup costs a job differently from how it was costed before.
var bonusesByStoredID = map[int]struct{ Material, Time float64 }{
	0: {0, 0},
	1: {2.0, 0},
	2: {2.4, 0},
	3: {0, 0.2},
	4: {0, 0.24},
	5: {2.0, 0.2},
	6: {2.4, 0.24},
	7: {2.0, 0.24},
	8: {2.4, 0.2},
	9: {3.7, 0.2},
}

// The atomic rigs the slots name, which is what the SPA tables now hold.
var atomicRigBonuses = map[int]struct{ Material, Time float64 }{
	0: {0, 0},
	1: {2.0, 0},
	2: {2.4, 0},
	3: {0, 0.2},
	4: {0, 0.24},
	9: {3.7, 0.2},
}

func TestEveryStoredRigIDKeepsItsBonuses(t *testing.T) {
	t.Parallel()

	for storedID, want := range bonusesByStoredID {
		pair, known := rigSlotsByStoredID[storedID]
		if !known {
			t.Errorf("stored rigID %d has no conversion", storedID)
			continue
		}

		// Each axis takes the better of the two slots, independently — the rule
		// the SPA reads them back with.
		first, second := atomicRigBonuses[pair.Slot1], atomicRigBonuses[pair.Slot2]
		material := max(first.Material, second.Material)
		time := max(first.Time, second.Time)

		if material != want.Material || time != want.Time {
			t.Errorf("rigID %d -> slots %d/%d gives material %v time %v, want material %v time %v",
				storedID, pair.Slot1, pair.Slot2, material, time, want.Material, want.Time)
		}
	}
}

func TestEveryStoredRigIDHasAConversion(t *testing.T) {
	t.Parallel()

	// Ten ids were storable, 0 through 9. A gap would leave setups naming a rig
	// nothing converts and nothing can read.
	for storedID := range 10 {
		if _, known := rigSlotsByStoredID[storedID]; !known {
			t.Errorf("stored rigID %d has no conversion", storedID)
		}
	}
}

func TestFoldSetupRigReplacesTheStoredID(t *testing.T) {
	t.Parallel()

	setup := bson.M{"rigID": int32(5), "runCount": 10}
	if !foldSetupRig(setup) {
		t.Fatal("a setup naming a combined id was not folded")
	}

	if setup["rigSlot1"] != 1 || setup["rigSlot2"] != 3 {
		t.Errorf("slots = %v/%v, want 1/3", setup["rigSlot1"], setup["rigSlot2"])
	}
	if _, held := setup["rigID"]; held {
		t.Error("the stored rigID survived the fold")
	}
	// Everything else on the setup is left as it was.
	if setup["runCount"] != 10 {
		t.Errorf("runCount = %v, want it untouched", setup["runCount"])
	}
}

func TestFoldSetupRigIsIdempotent(t *testing.T) {
	t.Parallel()

	setup := bson.M{"rigID": int32(6)}
	foldSetupRig(setup)
	first1, first2 := setup["rigSlot1"], setup["rigSlot2"]

	if foldSetupRig(setup) {
		t.Error("a folded setup was folded again")
	}
	if setup["rigSlot1"] != first1 || setup["rigSlot2"] != first2 {
		t.Errorf("slots moved on a second fold: %v/%v then %v/%v",
			first1, first2, setup["rigSlot1"], setup["rigSlot2"])
	}
}

func TestFoldSetupRigLeavesWhatItDoesNotUnderstand(t *testing.T) {
	t.Parallel()

	// A setup with no rig named at all is not this step's to touch.
	noRig := bson.M{"runCount": 1}
	if foldSetupRig(noRig) {
		t.Error("a setup naming no rig was folded")
	}

	// An id from a shape nothing in this release wrote is left as it is rather
	// than guessed at.
	unknown := bson.M{"rigID": int32(42)}
	if foldSetupRig(unknown) {
		t.Error("an unknown rigID was folded")
	}
	if unknown["rigID"] != int32(42) {
		t.Errorf("rigID = %v, want it left alone", unknown["rigID"])
	}
}

// A stored zero means "no rig", which is a real answer and converts to two empty
// slots rather than being mistaken for an absent field.
func TestFoldSetupRigConvertsAStoredNone(t *testing.T) {
	t.Parallel()

	setup := bson.M{"rigID": int32(0)}
	if !foldSetupRig(setup) {
		t.Fatal("a setup naming no rig was not folded")
	}
	if setup["rigSlot1"] != 0 || setup["rigSlot2"] != 0 {
		t.Errorf("slots = %v/%v, want 0/0", setup["rigSlot1"], setup["rigSlot2"])
	}
}

func TestFoldRigSlotsWalksAJobDocument(t *testing.T) {
	t.Parallel()

	doc := bson.M{
		"_id": "job-1",
		"build": bson.M{
			"setup": bson.M{
				"setup-a": bson.M{"rigID": int32(5)},
				"setup-b": bson.M{"rigID": int32(8)},
				"setup-c": bson.M{"rigSlot1": 1, "rigSlot2": 0},
			},
		},
	}

	if changed := foldRigSlotsInDocument(eipmongo.CollectionJobDocuments, doc); changed != 2 {
		t.Errorf("folded %d setups, want the 2 that named a combined id", changed)
	}

	setups := doc["build"].(bson.M)["setup"].(bson.M)
	if got := setups["setup-a"].(bson.M); got["rigSlot1"] != 1 || got["rigSlot2"] != 3 {
		t.Errorf("setup-a slots = %v/%v, want 1/3", got["rigSlot1"], got["rigSlot2"])
	}
	if got := setups["setup-b"].(bson.M); got["rigSlot1"] != 2 || got["rigSlot2"] != 3 {
		t.Errorf("setup-b slots = %v/%v, want 2/3", got["rigSlot1"], got["rigSlot2"])
	}
}

// A template stores its setups in an array on each job node rather than in a map
// on a build, so the walk differs and is worth its own test.
func TestFoldRigSlotsWalksATemplatePayload(t *testing.T) {
	t.Parallel()

	doc := bson.M{
		"_id": "template-1",
		"jobs": bson.A{
			bson.M{"presetSetups": bson.A{
				bson.M{"rigID": int32(7)},
				bson.M{"rigID": int32(0)},
			}},
			bson.M{"presetSetups": bson.A{
				bson.M{"rigID": int32(9)},
			}},
		},
	}

	if changed := foldRigSlotsInDocument(eipmongo.CollectionGroupTemplatePayloads, doc); changed != 3 {
		t.Errorf("folded %d setups, want 3", changed)
	}

	first := doc["jobs"].(bson.A)[0].(bson.M)["presetSetups"].(bson.A)[0].(bson.M)
	if first["rigSlot1"] != 1 || first["rigSlot2"] != 4 {
		t.Errorf("first setup slots = %v/%v, want 1/4", first["rigSlot1"], first["rigSlot2"])
	}

	faction := doc["jobs"].(bson.A)[1].(bson.M)["presetSetups"].(bson.A)[0].(bson.M)
	if faction["rigSlot1"] != 9 || faction["rigSlot2"] != 0 {
		t.Errorf("faction setup slots = %v/%v, want 9/0", faction["rigSlot1"], faction["rigSlot2"])
	}
}
