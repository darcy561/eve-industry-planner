package conversion

// RecipeActivities mirrors SDE blueprint activities for static recipe output.
// Invention uses Option B: each key is the source blueprint type ID (string); the value is that row's invention payload (materials, skills, time, products).
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
	Volume             float64           `json:"volume,omitzero"`
	BasePrice          float64           `json:"basePrice,omitzero"`
	GraphicID          int               `json:"graphicID,omitzero"`
	PortionSize        int               `json:"portionSize,omitzero"`
	JobType            int               `json:"jobType"`
	Activities         *RecipeActivities `json:"activities,omitempty"`
	BlueprintTypeID    int               `json:"blueprintTypeID,omitzero"`
	MaxProductionLimit int               `json:"maxProductionLimit,omitzero"`
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
	// CategoryID is the SDE inventory category the type's group belongs to, absent when unknown.
	CategoryID int `json:"category_id,omitzero"`
	// MarketGroupID is where the type sits in the market's own tree — the SDE's
	// `marketGroupID`, which `EVEType` carries as `MarketSectionID`. It is not
	// `EVEType.MarketGroupID`, which is the inventory group CategoryID comes from.
	// Absent for a type with no market group, which is most unpublished ones.
	MarketGroupID int `json:"market_group_id,omitzero"`
}

// MarketGroup is one node of the market tree: what to call it, and what contains
// it. A pricing default set on a group applies to everything beneath it, so the
// parent link is what makes the tree walkable rather than a flat list.
type MarketGroup struct {
	Name string `json:"name"`
	// ParentID is absent at a root, which is the only place the walk can stop.
	ParentID int `json:"parent_id,omitzero"`
	// Children names what sits directly inside this group, so a reader can walk
	// down as well as up. The SPA browses the tree to let a player choose a group
	// to price against, and deriving this from the parent links there means
	// inverting the whole map in every session — the same answer, rebuilt from
	// data this side already holds in order.
	Children []int `json:"children,omitempty"`
	// HasTypes says whether items sit in this group directly, as against only in
	// groups beneath it. Both are choosable — a default set on a container covers
	// everything under it — but a reader picking one deserves to know which it is.
	HasTypes bool `json:"has_types,omitzero"`
	// IconTypeID is an item from this group, for a reader to recognise it by.
	//
	// A market group has an icon of its own in the SDE, but it names a file inside
	// the game client rather than anything servable: the image server carries
	// types, characters and corporations and nothing else. So a group borrows one
	// of its own items, which is a picture of the thing either way — Minerals
	// shows Tritanium.
	//
	// A group holding nothing directly takes the first from the branch beneath it,
	// so a container is still recognisable. Absent where a group and everything
	// under it is obsolete and holds no published type at all.
	IconTypeID int `json:"icon_type_id,omitzero"`
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
