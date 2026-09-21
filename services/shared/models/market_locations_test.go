package models

import (
	"encoding/json"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// A market is stored beside the build kinds, not among them, so what a market
// row carries is what a market has and nothing a place a job runs in has.
func TestMarketLocationStoresOnlyWhatAMarketHas(t *testing.T) {
	raw, err := bson.Marshal(MarketLocation{
		ID:       "market-1",
		Name:     "Perimeter Azbel",
		RegionID: 10000002,
	})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	var stored bson.M
	if err := bson.Unmarshal(raw, &stored); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	for _, absent := range []string{
		"jobType", "systemType", "structureType", "tax",
		"rigType", "rigSlot1", "rigSlot2", "implant", "systemID",
	} {
		if _, found := stored[absent]; found {
			t.Errorf("a market row carries %q, which belongs to a place a job runs in", absent)
		}
	}
}

// The place is what says which sort of market a row is, so a row that names
// neither would be unaskable — and one that names a station must not also carry
// an empty structure id for a reader to mistake for one.
func TestMarketLocationOmitsThePlaceItDoesNotHold(t *testing.T) {
	raw, err := bson.Marshal(MarketLocation{
		ID:        "market-1",
		Name:      "Jita IV-4",
		RegionID:  10000002,
		StationID: 60003760,
	})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	var stored bson.M
	if err := bson.Unmarshal(raw, &stored); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	if _, found := stored["structureID"]; found {
		t.Error("a station's row carries a structure id")
	}
	if got, found := stored["stationID"]; !found || got != int64(60003760) {
		t.Errorf("stationID = %v, found %v", got, found)
	}
}

// Every market has a region. Omitting it when zero would store a market with
// nowhere to ask about it and read back as though that were ordinary.
func TestMarketLocationAlwaysStatesItsRegion(t *testing.T) {
	raw, err := bson.Marshal(MarketLocation{ID: "market-1", Name: "Half-filled in"})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	var stored bson.M
	if err := bson.Unmarshal(raw, &stored); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	if _, found := stored["regionID"]; !found {
		t.Error("a market with no region stores nothing about its region")
	}
}

// An owner with no markets says so. `null` would reach a client as the absence
// of an answer rather than as an answer.
func TestEmptyMarketLocationsEncodesAsAnEmptyList(t *testing.T) {
	encoded, err := json.Marshal(struct {
		MarketLocations MarketLocations `json:"marketLocations"`
	}{EmptyMarketLocations()})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	if string(encoded) != `{"marketLocations":[]}` {
		t.Errorf("encoded = %s, want an empty list", encoded)
	}
}

// The default document is what a new account starts from, and a nil lane there
// would reach the first client to read it as `null`.
func TestDefaultApplicationSettingsCarryAnEmptyLane(t *testing.T) {
	if got := DefaultApplicationSettings("account-1", time.Now().UTC()); got.MarketLocations == nil {
		t.Error("a new account's settings carry no market lane at all")
	}
}

// A market an organisation saved is internal to it until somebody says
// otherwise: adding one and giving it to every member are two acts, and the
// default has to be the one that surprises nobody.
func TestAMarketIsNotSharedUntilItIsSaidToBe(t *testing.T) {
	saved := MarketLocation{ID: "market-1", Name: "Perimeter Azbel", RegionID: 10000002}

	if saved.SharedWithMembers {
		t.Error("a market reaches every member of an organisation the moment it is saved")
	}
}

// Stored either way rather than omitted when false: "not shared" is an answer
// about the market, not the absence of one, and a reader of the document should
// not have to know which of the two an absent field meant.
func TestSharingIsStatedEvenWhenItIsNotShared(t *testing.T) {
	raw, err := bson.Marshal(MarketLocation{ID: "market-1", RegionID: 1})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	var stored bson.M
	if err := bson.Unmarshal(raw, &stored); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if _, found := stored["sharedWithMembers"]; !found {
		t.Error("a market that is not shared says nothing about sharing")
	}
}
