package models

import "time"

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
	DefaultMarket                  string  `bson:"defaultMarket" json:"defaultMarket"`
	DefaultOrders                  string  `bson:"defaultOrders" json:"defaultOrders"`
	HideCompleteMaterials          bool    `bson:"hideCompleteMaterials" json:"hideCompleteMaterials"`
	DefaultAssetLocation           int64   `bson:"defaultAssetLocation" json:"defaultAssetLocation"`
	CitadelBrokersFee              float64 `bson:"citadelBrokersFee" json:"citadelBrokersFee"`
	DefaultMaterialEfficiencyValue int     `bson:"defaultMaterialEfficiencyValue" json:"defaultMaterialEfficiencyValue"`
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

// CustomStructures represents the custom structures settings
type CustomStructures struct {
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
type ReprocessingSettings struct {
	DefaultReprocessingCharacter *string `bson:"defaultReprocessingCharacter,omitempty" json:"defaultReprocessingCharacter,omitempty"`
	PreferCompressed             bool    `bson:"preferCompressed" json:"preferCompressed"`
	CompressionBonusMultiplier   float64 `bson:"compressionBonusMultiplier" json:"compressionBonusMultiplier"`
	ValueMultiplier              float64 `bson:"valueMultiplier" json:"valueMultiplier"`
	WastePenaltyMultiplier       float64 `bson:"wastePenaltyMultiplier" json:"wastePenaltyMultiplier"`
	SellExcessMineralTypes       bool    `bson:"sellExcessMineralTypes" json:"sellExcessMineralTypes"`
}

// RefreshToken represents a refresh token for a character
type RefreshToken struct {
	CharacterHash string `bson:"CharacterHash" json:"characterHash"`
	RToken        string `bson:"rToken" json:"rToken"`
}

// UserMeta represents metadata for user documents (stored as _meta in MongoDB)
type UserMeta struct {
	MetaData    `bson:",inline" json:",inline"`
	CreatedAt   time.Time `bson:"createdAt" json:"createdAt"`
	LastLoginAt time.Time `bson:"lastLoginAt" json:"lastLoginAt"`
}

// UserAccountDocument represents a user document in the users collection
type UserAccountDocument struct {
	AccountID       string         `bson:"accountID" json:"accountID"`
	JobStatusArray  []JobStatus    `bson:"jobStatusArray" json:"jobStatusArray"`
	LinkedJobs      []int64        `bson:"linkedJobs" json:"linkedJobs"`
	LinkedTrans     []int64        `bson:"linkedTrans" json:"linkedTrans"`
	LinkedOrders    []int64        `bson:"linkedOrders" json:"linkedOrders"`
	RefreshTokens   []RefreshToken `bson:"refreshTokens" json:"refreshTokens"`
	FlagForDeletion bool           `bson:"flagForDeletion" json:"flagForDeletion"`
	DeletedAt       *time.Time     `bson:"deletedAt,omitempty" json:"deletedAt,omitempty"`
	MetaData        UserMeta       `bson:"_meta,omitempty" json:"_meta,omitempty"` // Metadata for change stream filtering and account lifecycle fields.
}

type ApplicationSettings struct {
	UseCloudAccounts                 bool                          `bson:"userCloudAccounts" json:"userCloudAccounts"`
	DisplayHelpCards                 bool                          `bson:"displayHelpCards" json:"displayHelpCards"`
	DefaultMarketLocation            string                        `bson:"defaultMarketLocation" json:"defaultMarketLocation"`
	DefaultOrderType                 string                        `bson:"defaultOrderType" json:"defaultOrderType"`
	LocalMarketDisplay               *string                       `bson:"localMarketDisplay,omitempty" json:"localMarketDisplay,omitempty"`
	LocalOrderDisplay                *string                       `bson:"localOrderDisplay,omitempty" json:"localOrderDisplay,omitempty"`
	EsiJobTab                        *string                       `bson:"esiJobTab,omitempty" json:"esiJobTab,omitempty"`
	EnableCompactLayoutView          bool                          `bson:"enableCompactLayoutView" json:"enableCompactLayoutView"`
	EnableAutomaticJobRecalculation  bool                          `bson:"enableAutomaticJobRecalculation" json:"enableAutomaticJobRecalculation"`
	EnableSkipMissingBlueprints      bool                          `bson:"enableSkipMissingBlueprints" json:"enableSkipMissingBlueprints"`
	HideCompleteMaterialsFromEditJob bool                          `bson:"hideCompleteMaterials" json:"hideCompleteMaterials"`
	DefaultStationIDForAssets        int64                         `bson:"defaultStationIDForAssets" json:"defaultStationIDForAssets"`
	DefaultCitadelBrokersFee         float64                       `bson:"defaultCitadelBrokersFee" json:"defaultCitadelBrokersFee"`
	DefaultMaterialEfficiencyValue   int                           `bson:"defaultMaterialEfficiencyValue" json:"defaultMaterialEfficiencyValue"`
	CustomStructures                 CustomStructures              `bson:"customStructures" json:"customStructures"`
	ExemptTypeIDs                    []int                         `bson:"exemptTypeIDs,omitempty" json:"exemptTypeIDs,omitempty"`
	ReprocessingSettings             ReprocessingSettings          `bson:"reprocessingSettings" json:"reprocessingSettings"`
	ExtrasCategories                 []ExtraCategory               `bson:"extrasCategories,omitempty" json:"extrasCategories,omitempty"`
	PredefinedSystemIndexes          map[string]map[string]float64 `bson:"predefinedSystemIndexes,omitempty" json:"predefinedSystemIndexes,omitempty"`
	MetaData                         MetaData                      `bson:"_meta,omitempty" json:"_meta,omitempty"`
}
