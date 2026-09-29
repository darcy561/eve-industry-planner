package conversion

import "testing"

func TestBuildCategoryByGroupID(t *testing.T) {
	groups := map[string]any{
		"25":  map[string]any{"categoryID": float64(6)},
		"18":  map[string]any{"categoryID": float64(4)},
		"448": map[string]any{},
		"bad": map[string]any{"categoryID": float64(6)},
		"7":   "not an object",
	}

	byGroupID := BuildCategoryByGroupID(groups)

	if got := byGroupID[25]; got != 6 {
		t.Errorf("frigate group category = %d, want 6", got)
	}
	if got := byGroupID[18]; got != 4 {
		t.Errorf("mineral group category = %d, want 4", got)
	}
	if _, ok := byGroupID[448]; ok {
		t.Error("a group stating no category should not be mapped")
	}
	if len(byGroupID) != 2 {
		t.Errorf("mapped %d groups, want 2", len(byGroupID))
	}
}

func TestGenerateFullItemListOutputCarriesCategory(t *testing.T) {
	combined := map[string]*EVEType{
		"587": {ItemID: 587, Name: "Rifter", MarketGroupID: 25},
		"34":  {ItemID: 34, Name: "Tritanium", MarketGroupID: 18},
		"99":  {ItemID: 99, Name: "Oddity", MarketGroupID: 448},
	}
	byGroupID := map[int]int{25: 6, 18: 4}

	out := GenerateFullItemListOutput(combined, byGroupID)

	if out["587"].CategoryID != 6 {
		t.Errorf("Rifter category = %d, want 6", out["587"].CategoryID)
	}
	if out["34"].CategoryID != 4 {
		t.Errorf("Tritanium category = %d, want 4", out["34"].CategoryID)
	}
	if out["99"].CategoryID != 0 {
		t.Errorf("uncategorised item = %d, want 0", out["99"].CategoryID)
	}
	if out["587"].GroupID != 25 {
		t.Errorf("Rifter group = %d, want 25", out["587"].GroupID)
	}
	if out["99"].GroupID != 448 {
		t.Errorf("uncategorised item group = %d, want 448", out["99"].GroupID)
	}
	if out["587"].Name != "Rifter" {
		t.Errorf("Rifter name = %q", out["587"].Name)
	}
}

// An asset list names whatever a player holds, so the types that never reach a market — a SKIN, an
// unpublished oddity, a relic with no market group — have to be named too.
func TestGenerateFullItemListOutputNamesEveryPublishedType(t *testing.T) {
	combined := map[string]*EVEType{
		"42614": {ItemID: 42614, Name: "Venture Morphite Shine SKIN", MarketGroupID: 1950},
		"83639": {ItemID: 83639, Name: "SKINR Design Element Reward", MarketGroupID: 314},
		"30599": {ItemID: 30599, Name: "Intact Electromechanical Component", MarketGroupID: 990},
		"46166": {ItemID: 46166, Name: "Reaction Formula", MarketGroupID: 1888},
		"686":   {ItemID: 686, Name: "Rifter Blueprint", MarketGroupID: 105},
	}

	out := GenerateFullItemListOutput(combined, map[int]int{990: 34})

	if len(out) != len(combined) {
		t.Fatalf("named %d of %d types", len(out), len(combined))
	}
	for key, want := range combined {
		if out[key] == nil || out[key].Name != want.Name {
			t.Errorf("type %s = %v, want %q", key, out[key], want.Name)
		}
	}
	// A relic's category is what tells the SPA to draw it from EVE's relic image.
	if out["30599"].CategoryID != 34 {
		t.Errorf("relic category = %d, want 34", out["30599"].CategoryID)
	}
}

// The two ids are crossed on EVEType and a swap would look right everywhere: both
// are small integers and both resolve to a real group. Only asserting them apart
// on one type catches it.
func TestGenerateFullItemListOutputTakesTheMarketGroupNotTheInventoryGroup(t *testing.T) {
	combined := map[string]*EVEType{
		"34": {
			ItemID: 34,
			Name:   "Tritanium",
			// The inventory group, which the category is looked up by.
			MarketGroupID: 18,
			// The market group, which is what a pricing default is keyed on.
			MarketSectionID: 1857,
		},
	}

	out := GenerateFullItemListOutput(combined, map[int]int{18: 4})

	if got := out["34"].MarketGroupID; got != 1857 {
		t.Errorf("market group = %d, want 1857", got)
	}
	if got := out["34"].CategoryID; got != 4 {
		t.Errorf("category = %d, want 4", got)
	}
}

// Most unpublished types have no market group, and omitempty keeps the field off
// them rather than claiming group zero.
func TestGenerateFullItemListOutputLeavesTypesWithNoMarketGroup(t *testing.T) {
	out := GenerateFullItemListOutput(
		map[string]*EVEType{"1": {ItemID: 1, Name: "Nameless"}},
		map[int]int{},
	)

	if got := out["1"].MarketGroupID; got != 0 {
		t.Errorf("market group = %d, want 0", got)
	}
}
