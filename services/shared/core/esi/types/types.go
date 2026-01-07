package types

// SystemIndexes is the normalized structure used internally for industry system cost indices.
type SystemIndexes struct {
	SolarSystemID    int32   `json:"solar_system_id"`
	LastUpdated      int64   `json:"lastUpdated"`
	Manufacturing    float64 `json:"manufacturing,omitempty"`
	ResearchTime     float64 `json:"researching_time_efficiency,omitempty"`
	ResearchMaterial float64 `json:"researching_material_efficiency,omitempty"`
	Copying          float64 `json:"copying,omitempty"`
	Invention        float64 `json:"invention,omitempty"`
	Reaction         float64 `json:"reaction,omitempty"`
}

// AdjustedPrice is the normalized structure used internally (only adjusted price per user request).
type AdjustedPrice struct {
	TypeID        int32   `json:"type_id"`
	AdjustedPrice float64 `json:"adjusted_price"`
	LastUpdated   int64   `json:"last_updated"`
}
