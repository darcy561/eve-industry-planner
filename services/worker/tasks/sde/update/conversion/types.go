package conversion

type EVEType struct {
	Key                int                    `json:"_key"`
	ItemID             int                    `json:"itemID"`
	Name               string                 `json:"name"`
	GroupID            int                    `json:"groupID,omitempty"`
	MarketSectionID    int                    `json:"marketSectionID,omitempty"`
	MarketGroupID      int                    `json:"marketGroupID,omitempty"`
	MetaGroupID        int                    `json:"metaGroupID,omitempty"`
	RaceID             int                    `json:"raceID,omitempty"`
	Volume             float64                `json:"volume,omitempty"`
	BasePrice          float64                `json:"basePrice,omitempty"`
	GraphicID          int                    `json:"graphicID,omitempty"`
	PortionSize        int                    `json:"portionSize,omitempty"`
	JobType            int                    `json:"jobType"`
	Activities         map[string]interface{} `json:"activities,omitempty"`
	BlueprintTypeID    int                    `json:"blueprintTypeID,omitempty"`
	MaxProductionLimit int                    `json:"maxProductionLimit,omitempty"`
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
