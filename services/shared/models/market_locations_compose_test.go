package models

import (
	"testing"

	"go.mongodb.org/mongo-driver/v2/bson"
)

func citadel(id string, structureID int64, opts ...func(*MarketLocation)) MarketLocation {
	location := MarketLocation{
		ID:          id,
		Name:        id,
		RegionID:    10000002,
		StructureID: structureID,
	}
	for _, opt := range opts {
		opt(&location)
	}
	return location
}

func offered(location *MarketLocation) { location.SharedWithMembers = true }

func corp(ref string, locations ...MarketLocation) SharedMarketLocations {
	return SharedMarketLocations{Owner: Owner{Kind: OwnerCorporation, ID: ref}, Locations: locations}
}

func alliance(ref string, locations ...MarketLocation) SharedMarketLocations {
	return SharedMarketLocations{Owner: Owner{Kind: OwnerAlliance, ID: ref}, Locations: locations}
}

func ids(composed MarketLocations) []string {
	out := make([]string, 0, len(composed))
	for _, location := range composed {
		out = append(out, location.ID)
	}
	return out
}

func TestAReaderKeepsTheirOwnMarkets(t *testing.T) {
	composed := ComposeMarketLocations(
		MarketLocations{citadel("mine", 1001)},
		nil,
	)

	if got := ids(composed); len(got) != 1 || got[0] != "mine" {
		t.Errorf("composed = %v, want the reader's own market", got)
	}
}

// The whole point of an organisation's markets: a member does not add them.
func TestAnOrganisationsSharedMarketsReachItsMembers(t *testing.T) {
	composed := ComposeMarketLocations(
		MarketLocations{},
		[]SharedMarketLocations{corp("corp-1", citadel("theirs", 1001, offered))},
	)

	if got := ids(composed); len(got) != 1 || got[0] != "theirs" {
		t.Errorf("composed = %v, want the corporation's market", got)
	}
}

// Saving a market for an organisation and handing it to everybody in that
// organisation are two acts, and only the second one is this.
func TestAMarketAnOrganisationHasNotSharedReachesNobody(t *testing.T) {
	composed := ComposeMarketLocations(
		MarketLocations{},
		[]SharedMarketLocations{corp("corp-1", citadel("internal", 1001))},
	)

	if got := ids(composed); len(got) != 0 {
		t.Errorf("composed = %v, want nothing", got)
	}
}

// Two rows naming one structure are two turns on the rotation and two walks of
// the same place on the reader's own token, an hour apart, for ever.
func TestOnePlaceIsOneMarketHoweverManyOwnersSavedIt(t *testing.T) {
	composed := ComposeMarketLocations(
		MarketLocations{citadel("mine", 1001)},
		[]SharedMarketLocations{corp("corp-1", citadel("theirs", 1001, offered))},
	)

	if got := ids(composed); len(got) != 1 || got[0] != "mine" {
		t.Errorf("composed = %v, want the reader's own row to win outright", got)
	}
}

// A place is the structure or station a row names, not the row's own id — two
// rows for one citadel have different ids by definition.
func TestTwoDifferentPlacesAreTwoMarkets(t *testing.T) {
	composed := ComposeMarketLocations(
		MarketLocations{citadel("mine-a", 1001), citadel("mine-b", 1002)},
		nil,
	)

	if got := ids(composed); len(got) != 2 {
		t.Errorf("composed = %v, want both places", got)
	}
}

// A reader is in a corporation that is in an alliance, so the corporation's row
// is the more specific of the two.
func TestTheNearerOwnerWinsAPlaceTwoOfThemShare(t *testing.T) {
	composed := ComposeMarketLocations(
		MarketLocations{},
		[]SharedMarketLocations{
			alliance("alliance-1", citadel("alliance-row", 1001, offered)),
			corp("corp-1", citadel("corp-row", 1001, offered)),
		},
	)

	if got := ids(composed); len(got) != 1 || got[0] != "corp-row" {
		t.Errorf("composed = %v, want the corporation's row", got)
	}
}

// Otherwise the answer would depend on the order the documents were read in,
// and a reader would see a market's name change between loads.
func TestAnEqualPairIsSettledTheSameWayEveryTime(t *testing.T) {
	first := ComposeMarketLocations(MarketLocations{}, []SharedMarketLocations{
		{Owner: Owner{Kind: OwnerPlanner, ID: "planner-b"}, Locations: MarketLocations{citadel("b-row", 1001, offered)}},
		{Owner: Owner{Kind: OwnerPlanner, ID: "planner-a"}, Locations: MarketLocations{citadel("a-row", 1001, offered)}},
	})
	second := ComposeMarketLocations(MarketLocations{}, []SharedMarketLocations{
		{Owner: Owner{Kind: OwnerPlanner, ID: "planner-a"}, Locations: MarketLocations{citadel("a-row", 1001, offered)}},
		{Owner: Owner{Kind: OwnerPlanner, ID: "planner-b"}, Locations: MarketLocations{citadel("b-row", 1001, offered)}},
	})

	// Named rather than merely compared: two calls agreeing proves only that the
	// answer is stable, and a tiebreak reversed in both directions agrees with
	// itself just as well.
	for _, composed := range []MarketLocations{first, second} {
		if got := ids(composed); len(got) != 1 || got[0] != "a-row" {
			t.Errorf("composed = %v, want the lower owner key to win", got)
		}
	}
}

// Nothing stops a reader saving one place twice today — the panel that would is
// Stage C — so the answer has to be stable rather than whichever row the map
// happened to reach first. Stored order decides it.
func TestTwoOfAReadersOwnRowsForOnePlaceTakeTheFirst(t *testing.T) {
	composed := ComposeMarketLocations(
		MarketLocations{citadel("saved-first", 1001), citadel("saved-second", 1001)},
		nil,
	)

	if got := ids(composed); len(got) != 1 || got[0] != "saved-first" {
		t.Errorf("composed = %v, want the first of the reader's own rows", got)
	}
}

// A market naming nowhere cannot be asked about, and offering it would put a
// market in front of a reader that no price could ever arrive for.
func TestAMarketNamingNowhereIsLeftOut(t *testing.T) {
	composed := ComposeMarketLocations(
		MarketLocations{{ID: "half-filled-in", Name: "Half filled in", RegionID: 10000002}},
		nil,
	)

	if got := ids(composed); len(got) != 0 {
		t.Errorf("composed = %v, want nothing", got)
	}
}

func TestAReaderWithNoMarketsComposesAnEmptyList(t *testing.T) {
	if composed := ComposeMarketLocations(nil, nil); composed == nil {
		t.Error("a reader with no markets composes nil rather than an empty list")
	}
}

// A panel says where a market came from, and the row's own id cannot tell one
// the reader saved from one that reached them through an organisation.
func TestASharedMarketSaysWhichOwnerSharedIt(t *testing.T) {
	composed := ComposeMarketLocations(
		MarketLocations{},
		[]SharedMarketLocations{corp("corp-1", citadel("theirs", 1001, offered))},
	)

	if len(composed) != 1 || composed[0].SharedBy != "corporation:corp-1" {
		t.Errorf("composed = %+v, want the corporation named", composed)
	}
}

// It is not a fact about the market, it is where this reader got it. A market
// they saved themselves came from nobody.
func TestAReadersOwnMarketIsSharedByNobody(t *testing.T) {
	composed := ComposeMarketLocations(MarketLocations{citadel("mine", 1001)}, nil)

	if len(composed) != 1 || composed[0].SharedBy != "" {
		t.Errorf("composed = %+v, want no owner named", composed)
	}
}

// Never stored: the same row is the corporation's own on the corporation's
// document, and shared only on a member's composed answer. Writing it would
// have a corporation's document claim the corporation shared it with itself.
func TestWhoSharedAMarketIsNotStored(t *testing.T) {
	raw, err := bson.Marshal(MarketLocation{ID: "m", RegionID: 1, SharedBy: "corporation:corp-1"})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	var stored bson.M
	if err := bson.Unmarshal(raw, &stored); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if _, found := stored["sharedBy"]; found {
		t.Error("a stored market says who shared it")
	}
}
