package conversion

import (
	"reflect"
	"testing"
)

func marketGroupsFixture() map[string]any {
	return map[string]any{
		// A root: the source gives it no parentGroupID at all.
		"4": map[string]any{"name": map[string]any{"en": "Ships"}},
		"5": map[string]any{
			"name":          map[string]any{"en": "Frigates"},
			"parentGroupID": float64(4),
		},
		// A parent the source names but does not carry.
		"9": map[string]any{
			"name":          map[string]any{"en": "Orphan"},
			"parentGroupID": float64(404),
		},
		// A root stated as zero rather than left out. Real data never does this,
		// but the walk stops on zero, so nothing may reach it by another route.
		"11": map[string]any{
			"name":          map[string]any{"en": "Stated Root"},
			"parentGroupID": float64(0),
		},
	}
}

// The cases below are about parentage, so they pass no item list: HasTypes has
// its own tests.
func generateFrom(source map[string]any) map[string]*MarketGroup {
	return GenerateMarketGroupsOutput(source, nil)
}

func TestMarketGroupsCarryTheirParent(t *testing.T) {
	groups := generateFrom(marketGroupsFixture())

	frigates, ok := groups["5"]
	if !ok {
		t.Fatal("frigates missing")
	}
	if frigates.Name != "Frigates" || frigates.ParentID != 4 {
		t.Fatalf("frigates = %+v", frigates)
	}
}

// A walk has to stop somewhere, and 0 is the only signal it gets.
func TestMarketGroupsRootHasNoParent(t *testing.T) {
	groups := generateFrom(marketGroupsFixture())

	if got := groups["4"]; got.ParentID != 0 {
		t.Fatalf("ships = %+v, want no parent", got)
	}
}

// A parent that is not in the file would send the walk somewhere that does not
// exist, so the group is kept as a root rather than pointed at nothing.
func TestMarketGroupsDropAParentThatIsNotThere(t *testing.T) {
	groups := generateFrom(marketGroupsFixture())

	orphan, ok := groups["9"]
	if !ok {
		t.Fatal("a group with a missing parent should still be named")
	}
	if orphan.ParentID != 0 {
		t.Fatalf("orphan = %+v, want no parent", orphan)
	}
}

func TestMarketGroupsTreatAStatedZeroAsARoot(t *testing.T) {
	groups := generateFrom(marketGroupsFixture())

	if got := groups["11"]; got.ParentID != 0 {
		t.Fatalf("stated root = %+v, want no parent", got)
	}
}

func TestMarketGroupsSkipWhatItCannotName(t *testing.T) {
	groups := generateFrom(map[string]any{
		"1": map[string]any{"name": map[string]any{"de": "Nur Deutsch"}},
		"2": map[string]any{"parentGroupID": float64(4)},
		"3": "not a group",
		// An empty name is no name: a picker showing it would offer a blank row
		// the player cannot tell from any other.
		"4": map[string]any{"name": map[string]any{"en": ""}},
	})

	if len(groups) != 0 {
		t.Fatalf("groups = %+v, want none", groups)
	}
}

// The SPA browses down as well as up, and inverting the parent links in every
// session is the same answer rebuilt from data this side already holds.
func TestMarketGroupsCarryTheirChildren(t *testing.T) {
	groups := generateFrom(marketGroupsFixture())

	if got := groups["4"].Children; !reflect.DeepEqual(got, []int{5}) {
		t.Fatalf("ships children = %v, want [5]", got)
	}
	if got := groups["5"].Children; got != nil {
		t.Fatalf("frigates children = %v, want none", got)
	}
}

// A group whose stated parent is not in the file is kept as a root, so nothing
// may claim it as a child either — the two halves have to agree.
func TestMarketGroupsDoNotParentAnOrphan(t *testing.T) {
	groups := generateFrom(marketGroupsFixture())

	for id, entry := range groups {
		for _, child := range entry.Children {
			if child == 9 {
				t.Fatalf("group %s claims the orphan as a child", id)
			}
		}
	}
}

// The published file is compared between builds, so the same source has to give
// the same bytes rather than whatever order the map happened to range in.
func TestMarketGroupsSortChildrenById(t *testing.T) {
	groups := generateFrom(map[string]any{
		"1": map[string]any{"name": map[string]any{"en": "Root"}},
		"7": map[string]any{"name": map[string]any{"en": "Later"}, "parentGroupID": float64(1)},
		"3": map[string]any{"name": map[string]any{"en": "Earlier"}, "parentGroupID": float64(1)},
		"5": map[string]any{"name": map[string]any{"en": "Middle"}, "parentGroupID": float64(1)},
	})

	if got := groups["1"].Children; !reflect.DeepEqual(got, []int{3, 5, 7}) {
		t.Fatalf("children = %v, want them in id order", got)
	}
}

// Read from the published item list rather than the SDE's own flag, so it
// answers whether the group holds anything the app knows about.
func TestMarketGroupsSayWhichHoldItems(t *testing.T) {
	groups := GenerateMarketGroupsOutput(marketGroupsFixture(), map[string]*FullItem{
		"34": {TypeID: 34, MarketGroupID: 5},
	})

	if !groups["5"].HasTypes {
		t.Fatal("frigates holds an item and should say so")
	}
	// A container holds its items through what is beneath it, not directly.
	if groups["4"].HasTypes {
		t.Fatal("ships holds nothing directly")
	}
}

// An item with no market group, and a group the item list never mentions, are
// both ordinary rather than errors.
func TestMarketGroupsIgnoreAnItemWithNoGroup(t *testing.T) {
	groups := GenerateMarketGroupsOutput(marketGroupsFixture(), map[string]*FullItem{
		"35": {TypeID: 35},
		"36": {TypeID: 36, MarketGroupID: 9999},
	})

	for id, entry := range groups {
		if entry.HasTypes {
			t.Fatalf("group %s claims items it does not hold", id)
		}
	}
}
