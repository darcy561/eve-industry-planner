package commands

import (
	"testing"

	"go.mongodb.org/mongo-driver/v2/bson"
)

func TestAStoredRigTypeBecomesTheSlotsItStoodFor(t *testing.T) {
	t.Parallel()

	structure := bson.M{"rigType": int32(5), "name": "Jita Sotiyo", "tax": 2.5}

	if !foldStructureRig(structure) {
		t.Fatal("a structure holding a rigType was not folded")
	}
	if structure["rigSlot1"] != 1 || structure["rigSlot2"] != 3 {
		t.Errorf("slots = %v/%v, want 1/3", structure["rigSlot1"], structure["rigSlot2"])
	}
	if _, held := structure["rigType"]; held {
		t.Error("the stored rigType survived the fold")
	}
	// Only the rig fields move: the row is the reader's structure, not this
	// step's to reshape.
	if structure["name"] != "Jita Sotiyo" || structure["tax"] != 2.5 {
		t.Errorf("the fold disturbed other fields: %v", structure)
	}
}

// The step runs against a database an earlier run may already have converted,
// and against one where nothing has.
func TestFoldingAStructureTwiceChangesNothingTheSecondTime(t *testing.T) {
	t.Parallel()

	structure := bson.M{"rigType": int32(9)}
	foldStructureRig(structure)
	first1, first2 := structure["rigSlot1"], structure["rigSlot2"]

	if foldStructureRig(structure) {
		t.Error("a folded structure was folded again")
	}
	if structure["rigSlot1"] != first1 || structure["rigSlot2"] != first2 {
		t.Errorf("slots moved on a second fold: %v/%v then %v/%v",
			first1, first2, structure["rigSlot1"], structure["rigSlot2"])
	}
}

// A row the SPA wrote after the change carries slots, and may still carry the
// rigType nothing reads. Keeping both would leave two answers to one question.
func TestAStaleRigTypeBesideSlotsIsDropped(t *testing.T) {
	t.Parallel()

	structure := bson.M{"rigSlot1": 2, "rigSlot2": 4, "rigType": int32(6)}

	if foldStructureRig(structure) {
		t.Error("a structure already holding slots was reported as converted")
	}
	if _, held := structure["rigType"]; held {
		t.Error("a stale rigType was kept beside the slots that replaced it")
	}
	if structure["rigSlot1"] != 2 || structure["rigSlot2"] != 4 {
		t.Errorf("slots = %v/%v, want the stored 2/4 untouched",
			structure["rigSlot1"], structure["rigSlot2"])
	}
}

func TestAnUnknownRigTypeIsLeftAlone(t *testing.T) {
	t.Parallel()

	unknown := bson.M{"rigType": int32(42)}

	if foldStructureRig(unknown) {
		t.Error("an unknown rigType was folded")
	}
	if unknown["rigType"] != int32(42) {
		t.Errorf("rigType = %v, want it left alone", unknown["rigType"])
	}
	if _, held := unknown["rigSlot1"]; held {
		t.Error("an unknown rigType was given slots")
	}
}

// A kind that never carried a rigType — reprocessing and invention already held
// slots — must not be given one.
func TestAStructureWithNoRigTypeIsNotTouched(t *testing.T) {
	t.Parallel()

	structure := bson.M{"implant": 3, "rigSlot1": 7, "rigSlot2": 8}

	if foldStructureRig(structure) {
		t.Error("a structure with no rigType was reported as converted")
	}
	if structure["rigSlot1"] != 7 || structure["rigSlot2"] != 8 {
		t.Error("the fold disturbed a structure it had nothing to do to")
	}
}

func TestEveryStructureInADocumentIsFolded(t *testing.T) {
	t.Parallel()

	doc := bson.M{
		"_id": "account-1",
		"customStructures": bson.A{
			bson.M{"id": "a", "rigType": int32(5)},
			bson.M{"id": "b", "rigType": int32(8)},
			bson.M{"id": "c", "rigSlot1": 1, "rigSlot2": 0},
			bson.M{"id": "d", "implant": 2},
		},
	}

	rows, changed := foldStructureRigSlotsInDocument(doc)
	if changed != 2 {
		t.Errorf("changed = %d, want the 2 holding a rigType", changed)
	}
	if got := rows[0].(bson.M); got["rigSlot1"] != 1 || got["rigSlot2"] != 3 {
		t.Errorf("a slots = %v/%v, want 1/3", got["rigSlot1"], got["rigSlot2"])
	}
	if got := rows[1].(bson.M); got["rigSlot1"] != 2 || got["rigSlot2"] != 3 {
		t.Errorf("b slots = %v/%v, want 2/3", got["rigSlot1"], got["rigSlot2"])
	}
}

// A document still holding the four keyed lists is one the lane fold could not
// move. Converting its rigs would write an array over lists nothing converted.
func TestTheKeyedListShapeIsNotFolded(t *testing.T) {
	t.Parallel()

	doc := bson.M{
		"_id": "account-1",
		"customStructures": bson.M{
			"manufacturing": bson.A{bson.M{"id": "a", "rigType": int32(5)}},
		},
	}

	rows, changed := foldStructureRigSlotsInDocument(doc)
	if changed != 0 || rows != nil {
		t.Errorf("a keyed-list document was folded: %d changed", changed)
	}
}
