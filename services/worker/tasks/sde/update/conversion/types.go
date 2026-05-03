package conversion

// RecipeActivities mirrors SDE blueprint activities for static recipe output.
// Invention uses Option B: each key is the source blueprint type ID (string); the value is that row's invention payload (materials, skills, time, products).
type RecipeActivities struct {
	Manufacturing    map[string]interface{}     `json:"manufacturing,omitempty"`
	Reaction         map[string]interface{}     `json:"reaction,omitempty"`
	Copying          map[string]interface{}     `json:"copying,omitempty"`
	ResearchMaterial map[string]interface{}     `json:"research_material,omitempty"`
	ResearchTime     map[string]interface{}     `json:"research_time,omitempty"`
	Invention        map[string]InventionSource `json:"invention,omitempty"`
}

// HasInventionSources is true when Option B invention map has at least one source blueprint.
func (a *RecipeActivities) HasInventionSources() bool {
	return a != nil && len(a.Invention) > 0
}

// ActivityMap returns manufacturing or reaction activity payloads used for material enrichment.
func (a *RecipeActivities) ActivityMap(key string) (map[string]interface{}, bool) {
	if a == nil {
		return nil, false
	}
	switch key {
	case "manufacturing":
		if a.Manufacturing == nil {
			return nil, false
		}
		return a.Manufacturing, true
	case "reaction":
		if a.Reaction == nil {
			return nil, false
		}
		return a.Reaction, true
	default:
		return nil, false
	}
}

// InventionSource is one SDE invention activity block (same keys as activities.invention in raw SDE, without nesting under sources).
type InventionSource struct {
	Materials []InventionMaterial `json:"materials,omitempty"`
	Skills    []InventionSkill    `json:"skills,omitempty"`
	Time      float64             `json:"time,omitempty"`
	Products  []InventionProduct  `json:"products,omitempty"`
}

type InventionMaterial struct {
	TypeID   float64 `json:"typeID"`
	Quantity float64 `json:"quantity"`
	Name     string  `json:"name,omitempty"`
	JobType  int     `json:"jobType,omitempty"`
	Volume   float64 `json:"volume,omitempty"`
}

type InventionSkill struct {
	TypeID float64 `json:"typeID"`
	Level  float64 `json:"level"`
}

type InventionProduct struct {
	TypeID      float64 `json:"typeID"`
	Quantity    float64 `json:"quantity,omitempty"`
	Probability float64 `json:"probability,omitempty"`
}

type EVEType struct {
	Key                int               `json:"_key"`
	ItemID             int               `json:"itemID"`
	Name               string            `json:"name"`
	GroupID            int               `json:"groupID,omitempty"`
	MarketSectionID    int               `json:"marketSectionID,omitempty"`
	MarketGroupID      int               `json:"marketGroupID,omitempty"`
	MetaGroupID        int               `json:"metaGroupID,omitempty"`
	RaceID             int               `json:"raceID,omitempty"`
	Volume             float64           `json:"volume,omitempty"`
	BasePrice          float64           `json:"basePrice,omitempty"`
	GraphicID          int               `json:"graphicID,omitempty"`
	PortionSize        int               `json:"portionSize,omitempty"`
	JobType            int               `json:"jobType"`
	Activities         *RecipeActivities `json:"activities,omitempty"`
	BlueprintTypeID    int               `json:"blueprintTypeID,omitempty"`
	MaxProductionLimit int               `json:"maxProductionLimit,omitempty"`
	// ExcludeFromRecipeList: invention was merged onto the manufactured item (same blueprint row); omit duplicate BPC-only recipe row.
	ExcludeFromRecipeList bool `json:"-"`
}

type ItemName struct {
	Name        string `json:"name"`
	ItemID      int    `json:"itemID"`
	BlueprintID int    `json:"blueprintID"`
	JobType     int    `json:"jobType"`
}

type FullItem struct {
	TypeID int    `json:"type_id"`
	Name   string `json:"name"`
}

type ReprocessingItem struct {
	ID                string         `json:"id"`
	Name              string         `json:"name"`
	Materials         map[string]int `json:"materials"`
	BatchSize         int            `json:"batchSize"`
	ItemType          int            `json:"itemType"`
	ReprocessingSkill int            `json:"reprocessingSkill"`
}

const (
	BaseMaterialID  = 0
	ManufacturingID = 1
	ReactionID      = 2
)
