package esiclient

import "time"

// The shapes ESI returns, exactly as it returns them at the compatibility date
// each endpoint pins in DefaultEndpointPolicies. Nothing here is ours: no
// timestamps we stamped, no fields we folded together. That is the point —
// bumping a compatibility date is reviewed against the struct beside it, which
// only works while the struct is a faithful record of the wire.
//
// Turning these into the shapes the application stores is the caller's job, and
// happens after decoding.
//
// Character, corporation and alliance ids arrive here raw. They are converted to
// refs at this boundary, before they reach a document, a task payload or a log.

// MarketOrder is one order from GET /markets/{region_id}/orders/.
type MarketOrder struct {
	Duration     int32     `json:"duration"`
	IsBuyOrder   bool      `json:"is_buy_order"`
	Issued       time.Time `json:"issued"`
	LocationID   int64     `json:"location_id"`
	MinVolume    int32     `json:"min_volume"`
	OrderID      int64     `json:"order_id"`
	Price        float64   `json:"price"`
	Range        string    `json:"range"`
	SystemID     int32     `json:"system_id"`
	TypeID       int32     `json:"type_id"`
	VolumeRemain int32     `json:"volume_remain"`
	VolumeTotal  int32     `json:"volume_total"`
}

// IndustrySystem is one system from GET /industry/systems/. ESI reports the
// activities as a list; flattening it is a decision for the caller.
type IndustrySystem struct {
	SolarSystemID int32       `json:"solar_system_id"`
	CostIndices   []CostIndex `json:"cost_indices"`
}

// CostIndex is one activity's index within an IndustrySystem.
type CostIndex struct {
	Activity  string  `json:"activity"`
	CostIndex float64 `json:"cost_index"`
}

// Activities ESI names in CostIndex.Activity.
const (
	ActivityManufacturing    = "manufacturing"
	ActivityResearchTime     = "researching_time_efficiency"
	ActivityResearchMaterial = "researching_material_efficiency"
	ActivityCopying          = "copying"
	ActivityInvention        = "invention"
	ActivityReaction         = "reaction"
)

// TypePrice is one entry from GET /markets/prices/.
type TypePrice struct {
	TypeID        int32   `json:"type_id"`
	AdjustedPrice float64 `json:"adjusted_price"`
	AveragePrice  float64 `json:"average_price"`
}

// CharacterAffiliation is one entry from POST /characters/affiliation/. The ids
// are raw and must be converted before they travel any further.
type CharacterAffiliation struct {
	CharacterID   int32 `json:"character_id"`
	CorporationID int32 `json:"corporation_id"`
	AllianceID    int32 `json:"alliance_id"`
	FactionID     int32 `json:"faction_id"`
}

// ServerStatus is GET /status/. Only availability is read from it; the fields
// are here because that is what the endpoint returns.
type ServerStatus struct {
	Players       int32     `json:"players"`
	ServerVersion string    `json:"server_version"`
	StartTime     time.Time `json:"start_time"`
	VIP           bool      `json:"vip"`
}
