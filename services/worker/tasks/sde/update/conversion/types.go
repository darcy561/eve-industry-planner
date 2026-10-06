package conversion

// RecipeActivities mirrors SDE blueprint activities for static recipe output, with invention keyed
// by source blueprint type ID.
type RecipeActivities struct {
	Manufacturing    map[string]any             `json:"manufacturing,omitempty"`
	Reaction         map[string]any             `json:"reaction,omitempty"`
	Copying          map[string]any             `json:"copying,omitempty"`
	ResearchMaterial map[string]any             `json:"research_material,omitempty"`
	ResearchTime     map[string]any             `json:"research_time,omitempty"`
	Invention        map[string]InventionSource `json:"invention,omitempty"`
}

// HasInventionSources is true when Option B invention map has at least one source blueprint.
func (a *RecipeActivities) HasInventionSources() bool {
	return a != nil && len(a.Invention) > 0
}

// ActivityMap returns manufacturing or reaction activity payloads used for material enrichment.
func (a *RecipeActivities) ActivityMap(key string) (map[string]any, bool) {
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
	Time      float64             `json:"time,omitzero"`
	Products  []InventionProduct  `json:"products,omitempty"`
}

type InventionMaterial struct {
	TypeID   float64 `json:"typeID"`
	Quantity float64 `json:"quantity"`
	Name     string  `json:"name,omitempty"`
	JobType  int     `json:"jobType,omitzero"`
	Volume   float64 `json:"volume,omitzero"`
}

type InventionSkill struct {
	TypeID float64 `json:"typeID"`
	Level  float64 `json:"level"`
}

type InventionProduct struct {
	TypeID      float64 `json:"typeID"`
	Quantity    float64 `json:"quantity,omitzero"`
	Probability float64 `json:"probability,omitzero"`
}

type EVEType struct {
	Key                int               `json:"_key"`
	ItemID             int               `json:"itemID"`
	Name               string            `json:"name"`
	MarketSectionID    int               `json:"marketSectionID,omitzero"`
	MarketGroupID      int               `json:"marketGroupID,omitzero"`
	MetaGroupID        int               `json:"metaGroupID,omitzero"`
	RaceID             int               `json:"raceID,omitzero"`
	FactionID          int               `json:"factionID,omitzero"`
	Volume             float64           `json:"volume,omitzero"`
	BasePrice          float64           `json:"basePrice,omitzero"`
	GraphicID          int               `json:"graphicID,omitzero"`
	PortionSize        int               `json:"portionSize,omitzero"`
	JobType            int               `json:"jobType"`
	Activities         *RecipeActivities `json:"activities,omitempty"`
	BlueprintTypeID    int               `json:"blueprintTypeID,omitzero"`
	MaxProductionLimit int               `json:"maxProductionLimit,omitzero"`
	// ExcludeFromRecipeList omits the BPC-only recipe row once its invention is merged onto the manufactured item.
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
	// CategoryID is the SDE inventory category the type's group belongs to, absent when unknown.
	CategoryID int `json:"category_id,omitzero"`
	// GroupID is the SDE inventory group the type belongs to, which an industry
	// bonus may be scoped to as readily as a category.
	GroupID int `json:"group_id,omitzero"`
	// FactionID is the militia a type belongs to, which a place may scope its own
	// bonus by. Absent for a type belonging to none.
	FactionID int `json:"faction_id,omitzero"`
	// MarketGroupID is the type's node in the market tree — the SDE's marketGroupID, which EVEType
	// carries as MarketSectionID — and absent for a type with no market group.
	MarketGroupID int `json:"market_group_id,omitzero"`
}

// MarketGroup is one node of the market tree: its name, its parent and what it holds, so the tree
// can be walked both ways.
type MarketGroup struct {
	Name string `json:"name"`
	// ParentID is absent at a root, which is the only place the walk can stop.
	ParentID int `json:"parent_id,omitzero"`
	// Children names the groups directly inside this one, so a reader can walk down as well as up.
	Children []int `json:"children,omitempty"`
	// HasTypes says whether items sit directly in this group rather than only in groups beneath it.
	HasTypes bool `json:"has_types,omitzero"`
	// IconTypeID is an item from this group, or from the branch beneath it, to recognise the group by;
	// absent where nothing under it is published.
	IconTypeID int `json:"icon_type_id,omitzero"`
}

// ReprocessingData is the reprocessing static file: every reprocessable item, and the volume of one
// unit of each material those items give.
type ReprocessingData struct {
	Items           map[string]*ReprocessingItem `json:"items"`
	MaterialVolumes map[string]float64           `json:"materialVolumes"`
}

// ReprocessingItem is one reprocessable type: what a batch gives, fixed or at random, the batch size,
// its kind, the skill that reprocesses it, and the volume of one unit.
type ReprocessingItem struct {
	ID                  string                   `json:"id"`
	Name                string                   `json:"name"`
	Materials           map[string]int           `json:"materials"`
	RandomizedMaterials map[string]QuantityRange `json:"randomizedMaterials,omitzero"`
	BatchSize           int                      `json:"batchSize"`
	ItemType            int                      `json:"itemType"`
	ReprocessingSkill   int                      `json:"reprocessingSkill"`
	Volume              float64                  `json:"volume,omitzero"`
}

// QuantityRange is the least and most of one mineral a batch gives when it gives that mineral.
type QuantityRange struct {
	QuantityMin int `json:"quantityMin"`
	QuantityMax int `json:"quantityMax"`
}

const (
	BaseMaterialID  = 0
	ManufacturingID = 1
	ReactionID      = 2
)
