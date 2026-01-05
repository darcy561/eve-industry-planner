package models

import (
	"time"
)

// JobStatus represents a job status entry in the jobStatusArray
type JobStatus struct {
	ID              int    `bson:"id" json:"id"`
	Name            string `bson:"name" json:"name"`
	SortOrder       int    `bson:"sortOrder" json:"sortOrder"`
	Expanded        bool   `bson:"expanded" json:"expanded"`
	OpenAPIJobs     bool   `bson:"openAPIJobs" json:"openAPIJobs"`
	CompleteAPIJobs bool   `bson:"completeAPIJobs" json:"completeAPIJobs"`
}

// AccountSettings represents the account settings
type AccountSettings struct {
	CloudAccounts bool `bson:"cloudAccounts" json:"cloudAccounts"`
}

// LayoutSettings represents the layout settings
type LayoutSettings struct {
	HideTutorials      bool    `bson:"hideTutorials" json:"hideTutorials"`
	LocalMarketDisplay *string `bson:"localMarketDisplay,omitempty" json:"localMarketDisplay,omitempty"`
	LocalOrderDisplay  *string `bson:"localOrderDisplay,omitempty" json:"localOrderDisplay,omitempty"`
	EsiJobTab          *string `bson:"esiJobTab,omitempty" json:"esiJobTab,omitempty"`
	EnableCompactView  bool    `bson:"enableCompactView" json:"enableCompactView"`
}

// EditJobSettings represents the edit job settings
type EditJobSettings struct {
	DefaultMarket                  string `bson:"defaultMarket" json:"defaultMarket"`
	DefaultOrders                  string `bson:"defaultOrders" json:"defaultOrders"`
	HideCompleteMaterials          bool   `bson:"hideCompleteMaterials" json:"hideCompleteMaterials"`
	DefaultAssetLocation           int64  `bson:"defaultAssetLocation" json:"defaultAssetLocation"`
	CitadelBrokersFee              int    `bson:"citadelBrokersFee" json:"citadelBrokersFee"`
	DefaultMaterialEfficiencyValue int    `bson:"defaultMaterialEfficiencyValue" json:"defaultMaterialEfficiencyValue"`
}

// CustomStructure represents a custom structure configuration for manufacturing and reaction jobs
type CustomStructure struct {
	ID            string  `bson:"id" json:"id"`
	JobType       int     `bson:"jobType" json:"jobType"`
	Name          string  `bson:"name" json:"name"`
	SystemType    int     `bson:"systemType" json:"systemType"`
	StructureType int     `bson:"structureType" json:"structureType"`
	RigType       int     `bson:"rigType" json:"rigType"`
	SystemID      int64   `bson:"systemID" json:"systemID"`
	Tax           float64 `bson:"tax" json:"tax"`
	Default       bool    `bson:"default" json:"default"`
}

// ReprocessingStructure represents a reprocessing structure configuration
type ReprocessingStructure struct {
	ID            string  `bson:"id" json:"id"`
	JobType       int     `bson:"jobType" json:"jobType"`
	Name          string  `bson:"name" json:"name"`
	StructureType int     `bson:"structureType" json:"structureType"`
	SystemType    int     `bson:"systemType" json:"systemType"`
	RigSlot1      int     `bson:"rigSlot1" json:"rigSlot1"`
	RigSlot2      int     `bson:"rigSlot2" json:"rigSlot2"`
	Implant       int     `bson:"implant" json:"implant"`
	Default       bool    `bson:"default" json:"default"`
	Tax           float64 `bson:"tax" json:"tax"`
}

// StructuresSettings represents the structures settings
type StructuresSettings struct {
	Manufacturing []CustomStructure       `bson:"manufacturing" json:"manufacturing"`
	Reaction      []CustomStructure       `bson:"reaction" json:"reaction"`
	Reprocessing  []ReprocessingStructure `bson:"reprocessing" json:"reprocessing"`
}

// ExtraCategory represents an extra cost category
type ExtraCategory struct {
	ID        string `bson:"id" json:"id"`
	Label     string `bson:"label" json:"label"`
	Deleted   bool   `bson:"deleted,omitempty" json:"deleted,omitempty"`
	DeletedAt *int64 `bson:"deletedAt,omitempty" json:"deletedAt,omitempty"`
}

// ReprocessingCalculationSettings represents reprocessing calculation preferences
type ReprocessingCalculationSettings struct {
	PreferCompressed           bool    `bson:"preferCompressed" json:"preferCompressed"`
	CompressionBonusMultiplier float64 `bson:"compressionBonusMultiplier" json:"compressionBonusMultiplier"`
	ValueMultiplier            float64 `bson:"valueMultiplier" json:"valueMultiplier"`
	WastePenaltyMultiplier     float64 `bson:"wastePenaltyMultiplier" json:"wastePenaltyMultiplier"`
	SellExcessMineralTypes     bool    `bson:"sellExcessMineralTypes" json:"sellExcessMineralTypes"`
}

// UserSettings represents all user settings
type UserSettings struct {
	Account                         AccountSettings                 `bson:"account" json:"account"`
	Layout                          LayoutSettings                  `bson:"layout" json:"layout"`
	EditJob                         EditJobSettings                 `bson:"editJob" json:"editJob"`
	Structures                      StructuresSettings              `bson:"structures" json:"structures"`
	ExemptTypeIDs                   []int                           `bson:"exemptTypeIDs,omitempty" json:"exemptTypeIDs,omitempty"`
	AutomaticJobRecalculation       bool                            `bson:"automaticJobRecalculation" json:"automaticJobRecalculation"`
	IgnoreItemsWithoutBlueprints    bool                            `bson:"ignoreItemsWithoutBlueprints" json:"ignoreItemsWithoutBlueprints"`
	DefaultReprocessingCharacter    *string                         `bson:"defaultReprocessingCharacter,omitempty" json:"defaultReprocessingCharacter,omitempty"`
	ReprocessingCalculationSettings ReprocessingCalculationSettings `bson:"reprocessingCalculationSettings" json:"reprocessingCalculationSettings"`
	ExtrasCategories                []ExtraCategory                 `bson:"extrasCategories,omitempty" json:"extrasCategories,omitempty"`
	PredefinedSystemIndexes         map[string]map[string]float64   `bson:"predefinedSystemIndexes,omitempty" json:"predefinedSystemIndexes,omitempty"`
}

// RefreshToken represents a refresh token for a character
type RefreshToken struct {
	CharacterHash string `bson:"CharacterHash" json:"characterHash"`
	RToken        string `bson:"rToken" json:"rToken"`
}

// UserMeta represents metadata for user documents (stored as _meta in MongoDB)
type UserMeta struct {
	ClientID string `bson:"clientID,omitempty" json:"clientID,omitempty"` // ClientID from X-Client-ID header (for change stream filtering)
}

// UserAccountDocument represents a user document in the users collection
type UserAccountDocument struct {
	AccountID      string         `bson:"accountID" json:"accountID"`
	JobStatusArray []JobStatus    `bson:"jobStatusArray" json:"jobStatusArray"`
	Deleted        *string        `bson:"deleted,omitempty" json:"deleted,omitempty"`
	LinkedJobs     []int64        `bson:"linkedJobs" json:"linkedJobs"`
	LinkedTrans    []int64        `bson:"linkedTrans" json:"linkedTrans"`
	LinkedOrders   []int64        `bson:"linkedOrders" json:"linkedOrders"`
	Settings       UserSettings   `bson:"settings" json:"settings"`
	RefreshTokens  []RefreshToken `bson:"refreshTokens" json:"refreshTokens"`
	Meta           UserMeta       `bson:"_meta,omitempty" json:"_meta,omitempty"` // Metadata for change stream filtering (consistent with jobs)
	CreatedAt      time.Time      `bson:"createdAt,omitempty" json:"createdAt,omitempty"`
	UpdatedAt      time.Time      `bson:"updatedAt,omitempty" json:"updatedAt,omitempty"`
	LastLoginAt    time.Time      `bson:"lastLoginAt,omitempty" json:"lastLoginAt,omitempty"`
}
