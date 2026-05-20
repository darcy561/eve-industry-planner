package firebaseuserdoc

import (
	"testing"

	"go.mongodb.org/mongo-driver/bson"

	"eve-industry-planner/shared/models"
)

func TestParseUserDoc_customStructuresStringScalarsCoercedOnMap(t *testing.T) {
	doc := map[string]interface{}{
		"accountID": "acct-1",
		"settings": map[string]interface{}{
			"structures": map[string]interface{}{
				"manufacturing": []interface{}{},
				"reaction": []interface{}{
					map[string]interface{}{
						"id":            "r1",
						"jobType":       2,
						"name":          "Test",
						"systemType":    1,
						"structureType": 1,
						"rigType":       1,
						"systemID":      "30000142",
						"tax":           "2.5",
						"default":       false,
					},
				},
				"reprocessing": []interface{}{},
			},
		},
	}
	fb, err := ParseUserDoc(doc)
	if err != nil {
		t.Fatalf("ParseUserDoc: %v", err)
	}
	if fb == nil || fb.Settings == nil || fb.Settings.Structures == nil {
		t.Fatal("expected settings.structures")
	}
	if len(fb.Settings.Structures.Reaction) != 1 {
		t.Fatalf("reaction len: %d", len(fb.Settings.Structures.Reaction))
	}

	mapped := MapApplicationSettings(fb, "acct-1")
	if len(mapped.CustomStructures.Reaction) != 1 {
		t.Fatalf("mapped reaction len: %d", len(mapped.CustomStructures.Reaction))
	}
	mcs := mapped.CustomStructures.Reaction[0]
	if mcs.SystemID != 30000142 {
		t.Fatalf("mapped systemID: got %d", mcs.SystemID)
	}
	if mcs.Tax != 2.5 {
		t.Fatalf("mapped tax: got %v", mcs.Tax)
	}
}

func TestParseUserDoc_customStructuresNumericScalarsStillDecode(t *testing.T) {
	doc := map[string]interface{}{
		"accountID": "a",
		"settings": map[string]interface{}{
			"structures": map[string]interface{}{
				"manufacturing": []interface{}{
					map[string]interface{}{
						"id":            "m1",
						"jobType":       1,
						"name":          "M",
						"systemType":    0,
						"structureType": 0,
						"rigType":       0,
						"systemID":      int64(30000142),
						"tax":           1.0,
						"default":       false,
					},
				},
				"reaction":     []interface{}{},
				"reprocessing": []interface{}{},
			},
		},
	}
	fb, err := ParseUserDoc(doc)
	if err != nil {
		t.Fatalf("ParseUserDoc: %v", err)
	}
	mapped := MapApplicationSettings(fb, "a")
	cs := mapped.CustomStructures.Manufacturing[0]
	if cs.SystemID != 30000142 {
		t.Fatalf("systemID: got %d", cs.SystemID)
	}
	if cs.Tax != 1.0 {
		t.Fatalf("tax: got %v", cs.Tax)
	}
}

func TestCustomStructureBSONRoundTrip_int64AndFloat64(t *testing.T) {
	type wrap struct {
		S models.CustomStructure `bson:"s"`
	}
	raw, err := bson.Marshal(map[string]interface{}{
		"s": map[string]interface{}{
			"id":            "x",
			"jobType":       1,
			"name":          "n",
			"systemType":    0,
			"structureType": 0,
			"rigType":       0,
			"systemID":      int64(42),
			"tax":           3.25,
			"default":       false,
		},
	})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var w wrap
	if err := bson.Unmarshal(raw, &w); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if w.S.SystemID != 42 {
		t.Fatalf("systemID: %d", w.S.SystemID)
	}
	if w.S.Tax != 3.25 {
		t.Fatalf("tax: %v", w.S.Tax)
	}
}
