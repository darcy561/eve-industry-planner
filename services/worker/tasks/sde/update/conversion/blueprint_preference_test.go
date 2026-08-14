package conversion

import (
	"encoding/json"
	"testing"
)

func TestConvertBlueprintDataToTypeIDMap_tungstenCarbidePrefersPublishedFormula(t *testing.T) {
	const testRow = `{"_key":45732,"activities":{"reaction":{"materials":[{"quantity":100,"typeID":16657},{"quantity":100,"typeID":16661}],"products":[{"quantity":20,"typeID":16672}],"skills":[{"level":1,"typeID":45746}],"time":360}},"blueprintTypeID":45732,"maxProductionLimit":1000000}`
	const liveRow = `{"_key":46207,"activities":{"reaction":{"materials":[{"quantity":5,"typeID":4051},{"quantity":100,"typeID":16657},{"quantity":100,"typeID":16661}],"products":[{"quantity":10000,"typeID":16672}],"skills":[{"level":3,"typeID":45746}],"time":10800}},"blueprintTypeID":46207,"maxProductionLimit":1000}`

	blueprints := map[string]any{}
	for _, raw := range []string{testRow, liveRow} {
		var row map[string]any
		if err := json.Unmarshal([]byte(raw), &row); err != nil {
			t.Fatal(err)
		}
		blueprints[blueprintTypeIDKey(row)] = row
	}

	types := map[string]any{}
	for _, raw := range []string{
		`{"_key":45732,"name":{"en":"Test Reaction Blueprint"},"published":false}`,
		`{"_key":46207,"name":{"en":"Tungsten Carbide Reaction Formula"},"published":true}`,
		`{"_key":16672,"name":{"en":"Tungsten Carbide"},"published":true}`,
	} {
		var row map[string]any
		if err := json.Unmarshal([]byte(raw), &row); err != nil {
			t.Fatal(err)
		}
		types[formatSDETypeIDKey(row["_key"])] = row
	}

	out := ConvertBlueprintDataToTypeIDMap(blueprints, types)
	matched, ok := out["16672"].(map[string]any)
	if !ok {
		t.Fatal("expected product 16672 to be indexed")
	}
	live := blueprints["46207"].(map[string]any)
	wantQty := firstActivityProductQuantityMust(t, live)
	bpID, _ := parseSDETypeID(matched["blueprintTypeID"])
	if bpID != 46207 {
		t.Fatalf("expected published formula 46207 for 16672, got %d", bpID)
	}
	if !isPublishedBlueprintFormula(matched, types) {
		t.Fatal("winning blueprint for 16672 must be a published formula type")
	}
	qty, ok := firstActivityProductQuantity(matched)
	if !ok || qty != wantQty {
		t.Fatalf("output quantity: got %d want %d from published SDE row", qty, wantQty)
	}
}

func firstActivityProductQuantityMust(t *testing.T, bp map[string]any) int {
	t.Helper()
	q, ok := firstActivityProductQuantity(bp)
	if !ok {
		t.Fatal("blueprint row missing product quantity")
	}
	return q
}

func TestConvertBlueprintDataToTypeIDMap_skipsUnpublishedBlueprint(t *testing.T) {
	const testRow = `{"_key":45732,"activities":{"reaction":{"products":[{"quantity":20,"typeID":16672}]}},"blueprintTypeID":45732}`
	types := map[string]any{
		"45732": map[string]any{"_key": float64(45732), "published": false},
		"16672": map[string]any{"_key": float64(16672), "published": true},
	}
	var row map[string]any
	if err := json.Unmarshal([]byte(testRow), &row); err != nil {
		t.Fatal(err)
	}
	out := ConvertBlueprintDataToTypeIDMap(map[string]any{"45732": row}, types)
	if _, ok := out["16672"]; ok {
		t.Fatal("unpublished formula must not index product 16672")
	}
	if _, ok := out["45732"]; ok {
		t.Fatal("unpublished formula must not be indexed by blueprint type ID")
	}
}
