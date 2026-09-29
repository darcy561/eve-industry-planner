package commands

import (
	"testing"

	eipmongo "eve-industry-planner/shared/mongo"

	"go.mongodb.org/mongo-driver/v2/bson"
)

func TestClearSetupZarzakhLeftoverClearsOnlyTheLeftover(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name       string
		setup      bson.M
		wantChange bool
		wantSystem any
	}{
		{
			name:       "a setup that moved off The Fulcrum",
			setup:      bson.M{"systemID": int32(zarzakhSystemID), "structureID": int32(2)},
			wantChange: true,
			wantSystem: 0,
		},
		{
			name:       "a setup still at The Fulcrum",
			setup:      bson.M{"systemID": int32(zarzakhSystemID), "structureID": int32(theFulcrumStructureID)},
			wantChange: false,
			wantSystem: int32(zarzakhSystemID),
		},
		{
			name:       "a setup somewhere else entirely",
			setup:      bson.M{"systemID": int32(30000142), "structureID": int32(2)},
			wantChange: false,
			wantSystem: int32(30000142),
		},
		{
			name:       "a setup naming no system at all",
			setup:      bson.M{"structureID": int32(2)},
			wantChange: false,
			wantSystem: nil,
		},
		{
			name:       "a setup at an NPC station carrying the leftover",
			setup:      bson.M{"systemID": int64(zarzakhSystemID), "structureID": int32(0)},
			wantChange: true,
			wantSystem: 0,
		},
	}

	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			if got := clearSetupZarzakhLeftover(testCase.setup); got != testCase.wantChange {
				t.Errorf("changed = %v, want %v", got, testCase.wantChange)
			}
			if got := testCase.setup["systemID"]; got != testCase.wantSystem {
				t.Errorf("systemID = %v, want %v", got, testCase.wantSystem)
			}
		})
	}
}

func TestClearZarzakhLeftoversIsIdempotent(t *testing.T) {
	t.Parallel()

	setup := bson.M{"systemID": int32(zarzakhSystemID), "structureID": int32(2)}

	if !clearSetupZarzakhLeftover(setup) {
		t.Fatal("the first pass should have cleared the leftover")
	}
	if clearSetupZarzakhLeftover(setup) {
		t.Error("the second pass changed a setup the first already cleared")
	}
}

func TestClearZarzakhLeftoversWalksAJobDocument(t *testing.T) {
	t.Parallel()

	doc := bson.M{
		"_id": "job-1",
		"build": bson.M{
			"setup": bson.M{
				"setup-a": bson.M{"systemID": int32(zarzakhSystemID), "structureID": int32(2)},
				"setup-b": bson.M{"systemID": int32(zarzakhSystemID), "structureID": int32(theFulcrumStructureID)},
				"setup-c": bson.M{"systemID": int32(30000142), "structureID": int32(1)},
			},
		},
	}

	if changed := clearZarzakhLeftoversInDocument(eipmongo.CollectionJobDocuments, doc); changed != 1 {
		t.Errorf("cleared %d setups, want the 1 carrying a leftover", changed)
	}

	setups := doc["build"].(bson.M)["setup"].(bson.M)
	if got := setups["setup-a"].(bson.M)["systemID"]; got != 0 {
		t.Errorf("setup-a systemID = %v, want 0", got)
	}
	if got := setups["setup-b"].(bson.M)["systemID"]; got != int32(zarzakhSystemID) {
		t.Errorf("setup-b systemID = %v, want Zarzakh kept", got)
	}
}

func TestClearZarzakhLeftoversWalksATemplatePayload(t *testing.T) {
	t.Parallel()

	doc := bson.M{
		"_id": "template-1",
		"jobs": bson.A{
			bson.M{"presetSetups": bson.A{
				bson.M{"systemID": int32(zarzakhSystemID), "structureID": int32(3)},
				bson.M{"systemID": int32(zarzakhSystemID), "structureID": int32(theFulcrumStructureID)},
			}},
		},
	}

	if changed := clearZarzakhLeftoversInDocument(eipmongo.CollectionGroupTemplatePayloads, doc); changed != 1 {
		t.Errorf("cleared %d setups, want 1", changed)
	}
}

// The two steps run in the same release against the same documents, so what
// matters is where a live setup ends up after both — not either one alone.
func TestALiveSetupSurvivesBothStepsInOrder(t *testing.T) {
	t.Parallel()

	doc := bson.M{
		"_id": "job-1",
		"build": bson.M{
			"setup": bson.M{
				"moved-off-the-fulcrum": bson.M{
					"rigID":       int32(5),
					"systemID":    int32(zarzakhSystemID),
					"structureID": int32(2),
				},
				"still-at-the-fulcrum": bson.M{
					"rigID":       int32(0),
					"systemID":    int32(zarzakhSystemID),
					"structureID": int32(theFulcrumStructureID),
				},
				"faction-rig-elsewhere": bson.M{
					"rigID":       int32(9),
					"systemID":    int32(30000142),
					"structureID": int32(2),
				},
			},
		},
	}

	foldRigSlotsInDocument(eipmongo.CollectionJobDocuments, doc)
	clearZarzakhLeftoversInDocument(eipmongo.CollectionJobDocuments, doc)

	setups := doc["build"].(bson.M)["setup"].(bson.M)

	moved := setups["moved-off-the-fulcrum"].(bson.M)
	if moved["rigSlot1"] != 1 || moved["rigSlot2"] != 3 {
		t.Errorf("moved slots = %v/%v, want 1/3", moved["rigSlot1"], moved["rigSlot2"])
	}
	if moved["systemID"] != 0 {
		t.Errorf("moved systemID = %v, want the leftover cleared", moved["systemID"])
	}
	if _, held := moved["rigID"]; held {
		t.Error("moved still names a combined rigID")
	}

	stayed := setups["still-at-the-fulcrum"].(bson.M)
	if stayed["systemID"] != int32(zarzakhSystemID) {
		t.Errorf("stayed systemID = %v, want Zarzakh kept", stayed["systemID"])
	}
	if stayed["rigSlot1"] != 0 || stayed["rigSlot2"] != 0 {
		t.Errorf("stayed slots = %v/%v, want 0/0", stayed["rigSlot1"], stayed["rigSlot2"])
	}

	faction := setups["faction-rig-elsewhere"].(bson.M)
	if faction["rigSlot1"] != 9 || faction["rigSlot2"] != 0 {
		t.Errorf("faction slots = %v/%v, want 9/0", faction["rigSlot1"], faction["rigSlot2"])
	}
	if faction["systemID"] != int32(30000142) {
		t.Errorf("faction systemID = %v, want its own system untouched", faction["systemID"])
	}
}
