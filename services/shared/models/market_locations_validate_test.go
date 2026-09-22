package models

import (
	"strings"
	"testing"
)

func aMarket(id string) MarketLocation {
	return MarketLocation{ID: id, Name: id, RegionID: 10000002, StationID: 60003760}
}

func aCitadel(id string) MarketLocation {
	return MarketLocation{ID: id, Name: id, RegionID: 10000002, StructureID: 1035466617946}
}

// An owner with no markets is an ordinary owner, not a refused one.
func TestAnEmptyLaneIsValid(t *testing.T) {
	if err := (MarketLocations{}).Validate(); err != nil {
		t.Errorf("an empty lane was refused: %v", err)
	}
}

func TestAWellFormedLaneIsAccepted(t *testing.T) {
	lane := MarketLocations{aMarket("mkt-1"), aCitadel("mkt-2")}

	if err := lane.Validate(); err != nil {
		t.Errorf("a well-formed lane was refused: %v", err)
	}
}

// Everything the price tier holds is keyed by the row's id, so two rows under
// one id are one market to the cache and two to the panel.
func TestTwoMarketsCannotShareAnID(t *testing.T) {
	err := MarketLocations{aMarket("mkt-1"), aCitadel("mkt-1")}.Validate()

	if err == nil || !strings.Contains(err.Error(), "appears twice") {
		t.Errorf("err = %v, want the duplicate id refused", err)
	}
}

func TestAMarketMustCarryAnID(t *testing.T) {
	market := aMarket("mkt-1")
	market.ID = "  "

	if err := (MarketLocations{market}).Validate(); err == nil {
		t.Error("a market with no id was accepted")
	}
}

// Every picker lists markets by name, so a nameless row is an empty option
// among other empty options.
func TestAMarketMustCarryAName(t *testing.T) {
	market := aMarket("mkt-1")
	market.Name = " "

	if err := (MarketLocations{market}).Validate(); err == nil {
		t.Error("a market with no name was accepted")
	}
}

func TestAMarketNameHasALimit(t *testing.T) {
	market := aMarket("mkt-1")
	market.Name = strings.Repeat("a", maxMarketLocationName+1)

	if err := (MarketLocations{market}).Validate(); err == nil {
		t.Error("a name longer than any picker can show was accepted")
	}
}

// An order book is read per region and narrowed to the place, so a market with
// no region is offered everywhere and prices nothing.
func TestAMarketMustNameItsRegion(t *testing.T) {
	market := aMarket("mkt-1")
	market.RegionID = 0

	if err := (MarketLocations{market}).Validate(); err == nil {
		t.Error("a market with no region was accepted")
	}
}

// Which sort of market a row is follows from the place it names, so a row
// naming both is a market of neither sort and a row naming neither cannot be
// asked about at all.
func TestAMarketNamesExactlyOnePlace(t *testing.T) {
	both := aMarket("mkt-1")
	both.StructureID = 1035466617946

	neither := aMarket("mkt-2")
	neither.StationID = 0

	for name, lane := range map[string]MarketLocations{
		"both":    {both},
		"neither": {neither},
	} {
		if err := lane.Validate(); err == nil {
			t.Errorf("a market naming %s was accepted", name)
		}
	}
}

// A station's fee is worked out from the seller's skills and standings. A
// stored one would stand in for that derivation and quote a rate nobody pays.
func TestAStationCarriesNoBrokerFee(t *testing.T) {
	market := aMarket("mkt-1")
	market.BrokerFee = 2.5

	if err := (MarketLocations{market}).Validate(); err == nil {
		t.Error("a station market carrying a broker fee was accepted")
	}
}

func TestABrokerFeeIsAPercentage(t *testing.T) {
	for _, fee := range []float64{-1, MaxBrokerFeePercent + 1} {
		citadel := aCitadel("mkt-1")
		citadel.BrokerFee = fee

		if err := (MarketLocations{citadel}).Validate(); err == nil {
			t.Errorf("a broker fee of %v was accepted", fee)
		}
	}
}

// A list this long is a mistake rather than a preference.
func TestALaneHasALimit(t *testing.T) {
	lane := make(MarketLocations, 0, maxMarketLocations+1)
	for i := 0; i <= maxMarketLocations; i++ {
		lane = append(lane, aMarket(string(rune('a'+i%26))+strings.Repeat("x", i)))
	}

	if err := lane.Validate(); err == nil {
		t.Error("a lane longer than the limit was accepted")
	}
}

// The hubs are the same type and go through nothing that validates them, but a
// rule the server's own configuration fails is a rule that is wrong.
func TestTheHubsSatisfyTheRule(t *testing.T) {
	if err := DefaultMarketLocations.Validate(); err != nil {
		t.Errorf("the trading hubs fail the rule saved markets are held to: %v", err)
	}
}

// A market is internal to the planner that saved it until somebody says
// otherwise, so the set this server is asked to price is the shared one.
func TestSharedNamesOnlyTheMarketsMembersCanSee(t *testing.T) {
	internal := aMarket("mkt-internal")
	offered := aCitadel("mkt-offered")
	offered.SharedWithMembers = true

	shared := MarketLocations{internal, offered}.Shared()

	if len(shared) != 1 || shared[0].ID != "mkt-offered" {
		t.Errorf("shared = %+v, want only the market the organisation offered", shared)
	}
}

// An empty list rather than nil, so a caller can range over it without asking
// whether the owner shared any.
func TestSharedOfNoneIsAnEmptyList(t *testing.T) {
	if got := (MarketLocations{}).Shared(); got == nil {
		t.Error("named nil rather than an empty list")
	}
}
