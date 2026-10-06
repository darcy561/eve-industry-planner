package update

import (
	"testing"

	"eve-industry-planner/shared/jsoncodec"
	"eve-industry-planner/worker/tasks/sde/update/conversion"
)

func TestAddReprocessingTypeIDsReadsItemsAndWhatTheyGive(t *testing.T) {
	b, err := jsoncodec.Marshal(conversion.ReprocessingData{
		Items: map[string]*conversion.ReprocessingItem{
			"1230": {ID: "1230", Materials: map[string]int{"34": 400}},
		},
		MaterialVolumes: map[string]float64{"34": 0.01, "99999": 1},
	})
	if err != nil {
		t.Fatal(err)
	}

	typeIDs := map[int32]struct{}{34: {}}
	added, err := addReprocessingTypeIDs(typeIDs, b)
	if err != nil {
		t.Fatal(err)
	}
	if added != 1 {
		t.Fatalf("added = %d, want 1 (Veldspar; Tritanium was already held)", added)
	}
	for _, id := range []int32{1230, 34} {
		if _, held := typeIDs[id]; !held {
			t.Errorf("type %d missing", id)
		}
	}
	if _, held := typeIDs[99999]; held {
		t.Error("a volume entry is not a type the file reprocesses or gives")
	}
}

func TestAddReprocessingTypeIDsReadsMineralsGivenOnlyAtRandom(t *testing.T) {
	b, err := jsoncodec.Marshal(conversion.ReprocessingData{
		Items: map[string]*conversion.ReprocessingItem{
			"90041": {
				ID:                  "90041",
				Materials:           map[string]int{},
				RandomizedMaterials: map[string]conversion.QuantityRange{"11399": {QuantityMin: 312, QuantityMax: 624}},
			},
		},
		MaterialVolumes: map[string]float64{},
	})
	if err != nil {
		t.Fatal(err)
	}

	typeIDs := map[int32]struct{}{}
	if _, err := addReprocessingTypeIDs(typeIDs, b); err != nil {
		t.Fatal(err)
	}
	if _, held := typeIDs[11399]; !held {
		t.Error("Morphite, given only at random, missing")
	}
}
