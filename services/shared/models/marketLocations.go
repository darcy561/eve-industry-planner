package models

// MarketLocation is one market an owner has saved, as against a place a job is
// performed in.
//
// Which sort of market it is follows from the place it names: a station id or a
// structure id, never both. Nothing stores a kind, because a stored kind and the
// place could disagree and only one of them can be right.
type MarketLocation struct {
	ID      string `bson:"id" json:"id"`
	Name    string `bson:"name" json:"name"`
	Default bool   `bson:"default" json:"default"`

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
}

// MarketLocations is a set of markets — the ones one owner has saved, or the
// hubs this server prices.
type MarketLocations []MarketLocation

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
	{ID: "jita", Name: "Jita", RegionID: 10000002, StationID: 60003760},
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
