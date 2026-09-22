package models

// MarketLocation is one market an owner has saved, as against a place a job is
// performed in.
//
// Which sort of market it is follows from the place it names: a station id or a
// structure id, never both. Nothing stores a kind, because a stored kind and the
// place could disagree and only one of them can be right.
type MarketLocation struct {
	ID   string `bson:"id" json:"id"`
	Name string `bson:"name" json:"name"`

	// Whether a market an organisation saved reaches the accounts of its members,
	// set by whoever manages that organisation's markets. A market is internal to
	// the planner until this is ticked, so adding one is not the same act as
	// giving it to everybody.
	//
	// Meaningless on an account's own row, which nobody inherits.
	SharedWithMembers bool `bson:"sharedWithMembers" json:"sharedWithMembers"`

	// Every market has a region, so an absent one is a fault to see rather than a
	// zero to hide — unlike the fields below, which are absent by kind.
	RegionID int64 `bson:"regionID" json:"regionID"`

	StationID   int64 `bson:"stationID,omitempty" json:"stationID,omitzero"`
	StructureID int64 `bson:"structureID,omitempty" json:"structureID,omitzero"`

	// What an NPC station's broker fee is derived from: the race that built it
	// names the faction a standing is held against, the owner the corporation
	// holding the other. Both are fixed for the station's life.
	RaceID  int64 `bson:"raceID,omitempty" json:"raceID,omitzero"`
	OwnerID int64 `bson:"ownerID,omitempty" json:"ownerID,omitzero"`

	// A citadel's rate, which nothing can derive. An NPC station's is worked out
	// from the seller's skills and standings, so a number stored there would
	// quote the untrained rate without saying so.
	BrokerFee float64 `bson:"brokerFee,omitempty" json:"brokerFee,omitzero"`

	// Which organisation shared this market, on a composed answer. Never
	// stored — `bson:"-"` — because it is not a fact about the market but about
	// where this reader got it: the same row is the corporation's own on the
	// corporation's document and shared on a member's answer.
	//
	// Empty on a market the reader saved themselves.
	SharedBy string `bson:"-" json:"sharedBy,omitzero"`

	// When this server last walked the orders this market is priced from, in
	// milliseconds. Never stored — `bson:"-"` — because it is not a fact about
	// the market but about how recently the server has read the region it sits
	// in, which changes without the market changing at all.
	//
	// Zero on a market this server does not price: a citadel is read with a
	// character's token, on the device that read it, so no clock here could
	// speak for it. Zero also on one whose region has not been walked yet, which
	// a market only just saved has not.
	PricedAt int64 `bson:"-" json:"pricedAt,omitzero"`
}

// MarketLocations is a set of markets — the ones one owner has saved, or the
// hubs this server prices.
type MarketLocations []MarketLocation

// DefaultHubID names the hub everything falls back to: what a new account is
// seeded to price against, on both sides of a job. Spelled once, because three
// places were spelling it and a fourth would have been no harder.
const DefaultHubID = "jita"

// DefaultMarketLocations are the trading hubs this server walks and serves
// prices for, as against the markets an owner saved for themselves.
//
// The same type as a saved market on purpose: a hub and a saved NPC station are
// the same thing to everything downstream — a region to walk and a station to
// filter the orders to — and two types for it had the two halves of the server
// disagreeing about whether a region id is 32 bits or 64.
//
// Static configuration, not a document: the SPA carries its own copy to offer
// and label them, and `market_hubs_parity_test.go` is the only thing connecting
// the two.
var DefaultMarketLocations = MarketLocations{
	{ID: DefaultHubID, Name: "Jita", RegionID: 10000002, StationID: 60003760},
	{ID: "amarr", Name: "Amarr", RegionID: 10000043, StationID: 60008494},
	{ID: "dodixie", Name: "Dodixie", RegionID: 10000032, StationID: 60011866},
	{ID: "hek", Name: "Hek", RegionID: 10000042, StationID: 60005686},
}

// EmptyMarketLocations returns an owner with no markets saved.
//
// An empty collection, never nil: the document states that the owner has no
// markets rather than saying nothing about them.
func EmptyMarketLocations() MarketLocations {
	return MarketLocations{}
}

// Shared are the markets of these that reach the members of the organisation
// that saved them.
//
// A market is internal to the planner until somebody says otherwise, so an
// unshared one is offered to nobody and is not a market this server has been
// asked to price.
func (m MarketLocations) Shared() MarketLocations {
	shared := MarketLocations{}
	for _, location := range m {
		if location.SharedWithMembers {
			shared = append(shared, location)
		}
	}
	return shared
}

// StationIDs names the NPC stations behind these markets, which is what the
// server has to be told to price.
//
// A citadel is left out: its orders are read with a character's token and
// cannot be walked centrally.
func (m MarketLocations) StationIDs() []int64 {
	stations := make([]int64, 0, len(m))
	for _, location := range m {
		if location.StationID != 0 {
			stations = append(stations, location.StationID)
		}
	}
	return stations
}

// TakeMarketLocations lifts the market rows out of a set of custom structures,
// returning the markets and the structures that are left.
//
// A market row carries a place and a build row does not, so a market naming
// neither a station nor a structure is left where it is: it cannot be priced,
// and moving it would put a row on the market lane that nothing could ever ask
// about while removing it from the one place a reader might still see and fix
// it.
//
// The ids do not change. A job setup naming a market by id keeps working, which
// is what makes this a move rather than a rebuild.
func TakeMarketLocations(structures CustomStructures) (MarketLocations, CustomStructures) {
	taken := MarketLocations{}
	left := CustomStructures{}

	for _, structure := range structures {
		if structure.JobType != StructureKindMarket ||
			(structure.StationID == 0 && structure.StructureID == 0) {
			left = append(left, structure)
			continue
		}

		taken = append(taken, MarketLocation{
			ID:          structure.ID,
			Name:        structure.Name,
			RegionID:    structure.RegionID,
			StationID:   structure.StationID,
			StructureID: structure.StructureID,
			RaceID:      structure.RaceID,
			OwnerID:     structure.OwnerID,
			BrokerFee:   structure.BrokerFee,
		})
	}

	return taken, left
}
