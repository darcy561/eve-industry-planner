package conversion

import (
	"encoding/json"
	"testing"
)

func TestReactionBlueprintMatching_mergesFormulaOntoProduct(t *testing.T) {
	const formulaRow = `{"_key":46157,"activities":{"reaction":{"materials":[{"quantity":5,"typeID":4246}],"products":[{"quantity":160,"typeID":30306}],"skills":[{"level":3,"typeID":45746}],"time":10800}},"blueprintTypeID":46157,"maxProductionLimit":1000}`
	const productType = `{"_key":30306,"groupID":429,"marketGroupID":2404,"name":{"en":"Methanofullerene"},"published":true,"volume":0.01}`
	const formulaType = `{"_key":46157,"groupID":1889,"name":{"en":"Methanofullerene Reaction Formula"},"published":true,"volume":0.01}`

	var bpRow map[string]interface{}
	if err := json.Unmarshal([]byte(formulaRow), &bpRow); err != nil {
		t.Fatal(err)
	}
	blueprints := map[string]interface{}{"46157": bpRow}

	types := map[string]interface{}{}
	for _, raw := range []string{productType, formulaType} {
		var row map[string]interface{}
		if err := json.Unmarshal([]byte(raw), &row); err != nil {
			t.Fatal(err)
		}
		types[formatSDETypeIDKey(row["_key"])] = row
	}

	bpMap := ConvertBlueprintDataToTypeIDMap(blueprints, types)
	combined := BuildCombinedItemMap(types, bpMap)
	MergeReactionFormulaOntoProduct(combined, BuildReactionProductByBlueprintTypeID(blueprints, types), types)

	product := combined["30306"]
	if product == nil {
		t.Fatal("expected product 30306 in combined map")
	}
	if product.JobType != ReactionID {
		t.Fatalf("product jobType: got %d want %d", product.JobType, ReactionID)
	}
	if product.BlueprintTypeID != 46157 {
		t.Fatalf("product blueprintTypeID: got %d want 46157", product.BlueprintTypeID)
	}
	if product.Activities == nil || product.Activities.Reaction == nil {
		t.Fatal("expected reaction activities on product")
	}

	formula := combined["46157"]
	if formula == nil {
		t.Fatal("expected formula 46157 in combined map")
	}
	if !formula.ExcludeFromRecipeList {
		t.Fatal("formula row should be excluded from recipe list")
	}
	if formula.Activities != nil && formula.Activities.Reaction != nil {
		t.Fatal("reaction activities should be merged off formula row")
	}

	recipeList := GenerateRecipeListOutput(combined)
	var productRecipe *EVEType
	for _, r := range recipeList {
		if r.ItemID == 30306 {
			productRecipe = r
		}
		if r.ItemID == 46157 {
			t.Fatal("formula itemID should not appear in recipe list")
		}
	}
	if productRecipe == nil {
		t.Fatal("product missing from recipe list")
	}
}

func TestParseSDETypeID(t *testing.T) {
	cases := []struct {
		in   any
		want int
		ok   bool
	}{
		{float64(30306), 30306, true},
		{int(46157), 46157, true},
		{"nope", 0, false},
	}
	for _, tc := range cases {
		got, ok := parseSDETypeID(tc.in)
		if ok != tc.ok || got != tc.want {
			t.Fatalf("parseSDETypeID(%#v) = %d, %v; want %d, %v", tc.in, got, ok, tc.want, tc.ok)
		}
	}
}
