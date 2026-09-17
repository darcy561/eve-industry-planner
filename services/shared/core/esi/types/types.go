package types

// SystemIndexes is the normalised structure used internally for industry system cost indices.
type SystemIndexes struct {
	SolarSystemID    int32   `json:"solar_system_id"`
	LastUpdated      int64   `json:"lastUpdated"`
	Manufacturing    float64 `json:"manufacturing,omitzero"`
	ResearchTime     float64 `json:"researching_time_efficiency,omitzero"`
	ResearchMaterial float64 `json:"researching_material_efficiency,omitzero"`
	Copying          float64 `json:"copying,omitzero"`
	Invention        float64 `json:"invention,omitzero"`
	Reaction         float64 `json:"reaction,omitzero"`
}

// AdjustedPrice is the normalised structure used internally (only adjusted price per user request).
type AdjustedPrice struct {
	TypeID        int32   `json:"type_id"`
	AdjustedPrice float64 `json:"adjusted_price"`
	LastUpdated   int64   `json:"last_updated"`
}
