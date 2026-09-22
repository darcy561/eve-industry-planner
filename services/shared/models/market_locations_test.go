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

func marketRow(id string, structureID int64) CustomStructure {
	return CustomStructure{
		ID:          id,
		Name:        id,
		JobType:     StructureKindMarket,
		RegionID:    10000002,
		StructureID: structureID,
		BrokerFee:   2.5,
	}
}

// The move is what puts a market on its own lane. Ids are not rewritten, so a
// job setup naming one keeps working and the device keeps the prices it holds
// under that id.
func TestTakingMarketsOutOfTheStructures(t *testing.T) {
	taken, left := TakeMarketLocations(CustomStructures{
		// JobType 1 is manufacturing; only the market kind has a constant here.
		{ID: "sotiyo", Name: "Sotiyo", JobType: 1, RigType: 3},
		marketRow("azbel-market", 1035466617946),
	})

	if len(taken) != 1 || taken[0].ID != "azbel-market" {
		t.Fatalf("taken = %+v, want the market", taken)
	}
	if taken[0].BrokerFee != 2.5 || taken[0].StructureID != 1035466617946 {
		t.Errorf("taken = %+v, want the fee and the place carried over", taken[0])
	}
	if len(left) != 1 || left[0].ID != "sotiyo" {
		t.Errorf("left = %+v, want the place a job runs in", left)
	}
}

// A market naming nowhere cannot be priced. Moving it would put a row on the
// market lane nothing could ask about, and take it out of the one place a
// reader might still see it and fix it.
func TestAMarketNamingNowhereIsNotMoved(t *testing.T) {
	taken, left := TakeMarketLocations(CustomStructures{
		{ID: "half-filled-in", Name: "Half filled in", JobType: StructureKindMarket, RegionID: 10000002},
	})

	if len(taken) != 0 {
		t.Errorf("taken = %+v, want nothing moved", taken)
	}
	if len(left) != 1 {
		t.Errorf("left = %+v, want the row left where a reader can see it", left)
	}
}

// Run twice over a document that has already moved, which a release step is,
// and nothing moves the second time.
func TestTakingMarketsTwiceTakesNothingTheSecondTime(t *testing.T) {
	_, left := TakeMarketLocations(CustomStructures{marketRow("azbel-market", 1035466617946)})

	taken, stillLeft := TakeMarketLocations(left)

	if len(taken) != 0 || len(stillLeft) != 0 {
		t.Errorf("second pass took %+v and left %+v, want nothing and nothing", taken, stillLeft)
	}
}

// Neither side is nil, so a document written from either states that it holds
// none rather than saying nothing about them.
func TestTakingFromNothingGivesTwoEmptyLists(t *testing.T) {
	taken, left := TakeMarketLocations(nil)

	if taken == nil || left == nil {
		t.Errorf("taken = %v, left = %v, want empty lists", taken, left)
	}
}

// What the server is told to price. A citadel is left out: its orders are read
// with a character's token and cannot be walked centrally, so naming one here
// would have the server tracking a region for a market it can never fill.
func TestStationIDsNamesOnlyTheMarketsAServerCanWalk(t *testing.T) {
	markets := MarketLocations{
		{ID: "mkt-1", Name: "Rens", StationID: 60004588, RegionID: 10000030},
		{ID: "mkt-2", Name: "A citadel", StructureID: 1035466617946, RegionID: 10000030},
		{ID: "mkt-3", Name: "Jita", StationID: 60003760, RegionID: 10000002},
	}

	got := markets.StationIDs()
	want := []int64{60004588, 60003760}

	if len(got) != len(want) {
		t.Fatalf("named %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("named %v, want %v", got, want)
		}
	}
}

// An empty list rather than nil, so a caller can range over it without asking
// whether the account had any.
func TestStationIDsOfNoMarketsIsAnEmptyList(t *testing.T) {
	empty := MarketLocations{}
	if got := empty.StationIDs(); got == nil {
		t.Error("named nil rather than an empty list")
	}
}
