package models

import "time"

// JobStatusEntry is one workflow stage in ApplicationSettings.jobStatuses (keyed by status id string).
// Values are objects so extra fields can be added later without another migration.
type JobStatusEntry struct {
	Name string `bson:"name" json:"name"`
}

// DefaultJobStatusesMap returns the standard five-stage planner labels keyed by id ("0"–"4").
func DefaultJobStatusesMap() map[string]JobStatusEntry {
	return map[string]JobStatusEntry{
		"0": {Name: "Planning"},
		"1": {Name: "Purchasing"},
		"2": {Name: "Building"},
		"3": {Name: "Complete"},
		"4": {Name: "For Sale"},
	}
}

// EmptyCustomStructures returns empty manufacturing / reaction / reprocessing lists.
func EmptyCustomStructures() CustomStructures {
	return CustomStructures{
		Manufacturing: []CustomStructure{},
		Reaction:      []CustomStructure{},
		Reprocessing:  []ReprocessingStructure{},
		Invention:     []InventionStructure{},
	}
}

// DefaultReprocessingSettings returns default reprocessing calculation preferences (no default character).
func DefaultReprocessingSettings() ReprocessingSettings {
	return ReprocessingSettings{
		DefaultReprocessingCharacter: nil,
		PreferCompressed:             true,
		CompressionBonusMultiplier:   0.25,
		ValueMultiplier:              2.0,
		WastePenaltyMultiplier:       0.1,
		SellExcessMineralTypes:       false,
	}
}

// DefaultExtrasCategories returns the built-in extra cost categories.
func DefaultExtrasCategories() []ExtraCategory {
	return []ExtraCategory{
		{ID: "0", Label: "Unassigned", Deleted: false, DeletedAt: nil},
		{ID: "1", Label: "Hauling Service", Deleted: false, DeletedAt: nil},
		{ID: "2", Label: "Jump Freight Service", Deleted: false, DeletedAt: nil},
		{ID: "3", Label: "Blueprint Copies", Deleted: false, DeletedAt: nil},
		{ID: "4", Label: "Loyal Point Costs", Deleted: false, DeletedAt: nil},
		{ID: "5", Label: "Other", Deleted: false, DeletedAt: nil},
	}
}

// DefaultApplicationSettings returns a full new-account application_settings document for Mongo.
func DefaultApplicationSettings(accountID string, now time.Time) ApplicationSettings {
	return ApplicationSettings{
		SchemaVersion:                    ApplicationSettingsSchemaCurrent,
		DisplayHelpCards:                 false,
		DefaultMarketLocation:            "jita",
		DefaultOrderType:                 "sell",
		EsiJobTab:                        nil,
		EnableCompactLayoutView:          false,
		EnableAutomaticJobRecalculation:  true,
		EnableSkipMissingBlueprints:      false,
		HideCompleteMaterialsFromEditJob: false,
		DefaultStationIDForAssets:        60003760,
		DefaultCitadelBrokersFee:         1,
		DefaultMaterialEfficiencyValue:   0,
		ShareCitadelNames:                true,
		CustomStructures:                 EmptyCustomStructures(),
		ExemptTypeIDs:                    []int{},
		ReprocessingSettings:             DefaultReprocessingSettings(),
		ExtrasCategories:                 DefaultExtrasCategories(),
		PredefinedSystemIndexes:          make(map[string]map[string]float64),
		JobStatuses:                      DefaultJobStatusesMap(),
		MetaData: ApplicationSettingsMeta{
			MetaData: MetaData{
				LastModified: now,
				AccountID:    accountID,
			},
		},
	}
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

// InventionStructure represents an invention structure configuration
type InventionStructure struct {
	ID            string  `bson:"id" json:"id"`
	JobType       int     `bson:"jobType" json:"jobType"`
	Name          string  `bson:"name" json:"name"`
	StructureType int     `bson:"structureType" json:"structureType"`
	SystemType    int     `bson:"systemType" json:"systemType"`
	RigSlot1      int     `bson:"rigSlot1" json:"rigSlot1"`
	RigSlot2      int     `bson:"rigSlot2" json:"rigSlot2"`
	Default       bool    `bson:"default" json:"default"`
	Tax           float64 `bson:"tax" json:"tax"`
}

// CustomStructures represents the custom structures settings
type CustomStructures struct {
	Manufacturing []CustomStructure       `bson:"manufacturing" json:"manufacturing"`
	Reaction      []CustomStructure       `bson:"reaction" json:"reaction"`
	Reprocessing  []ReprocessingStructure `bson:"reprocessing" json:"reprocessing"`
	Invention     []InventionStructure    `bson:"invention" json:"invention"`
}

// ExtraCategory represents an extra cost category
type ExtraCategory struct {
	ID        string  `bson:"id" json:"id"`
	Label     string  `bson:"label" json:"label"`
	Deleted   bool    `bson:"deleted" json:"deleted"`
	DeletedAt *string `bson:"deletedAt" json:"deletedAt"` // RFC3339 / ISO-8601; null when not deleted
}

// ReprocessingSettings represents reprocessing calculation preferences stored on ApplicationSettings.
type ReprocessingSettings struct {
	DefaultReprocessingCharacter *string `bson:"defaultReprocessingCharacter,omitempty" json:"defaultReprocessingCharacter,omitempty"`
	PreferCompressed             bool    `bson:"preferCompressed" json:"preferCompressed"`
	CompressionBonusMultiplier   float64 `bson:"compressionBonusMultiplier" json:"compressionBonusMultiplier"`
	ValueMultiplier              float64 `bson:"valueMultiplier" json:"valueMultiplier"`
	WastePenaltyMultiplier       float64 `bson:"wastePenaltyMultiplier" json:"wastePenaltyMultiplier"`
	SellExcessMineralTypes       bool    `bson:"sellExcessMineralTypes" json:"sellExcessMineralTypes"`
}

// LinkedCharacterSession is returned at login / auth refresh for cloud-mode additional characters
// (short-lived access session material only; no refresh token).
type LinkedCharacterSession struct {
	CharacterHash string `json:"characterHash"`
	AccessToken   string `json:"access_token"`
	TokenType     string `json:"token_type"`
	ExpiresIn     int    `json:"expires_in"`
}

// ApplicationSettingsMeta holds document metadata under `_meta` (same pattern as Job ownership metadata).
type ApplicationSettingsMeta struct {
	MetaData `json:",inline" bson:",inline"`
}

type ApplicationSettings struct {
	SchemaVersion                    int                           `bson:"schemaVersion,omitempty" json:"schemaVersion,omitempty"`
	DisplayHelpCards                 bool                          `bson:"displayHelpCards" json:"displayHelpCards"`
	DefaultMarketLocation            string                        `bson:"defaultMarketLocation" json:"defaultMarketLocation"`
	DefaultOrderType                 string                        `bson:"defaultOrderType" json:"defaultOrderType"`
	EsiJobTab                        *string                       `bson:"esiJobTab,omitempty" json:"esiJobTab,omitempty"`
	EnableCompactLayoutView          bool                          `bson:"enableCompactLayoutView" json:"enableCompactLayoutView"`
	EnableAutomaticJobRecalculation  bool                          `bson:"enableAutomaticJobRecalculation" json:"enableAutomaticJobRecalculation"`
	EnableSkipMissingBlueprints      bool                          `bson:"enableSkipMissingBlueprints" json:"enableSkipMissingBlueprints"`
	HideCompleteMaterialsFromEditJob bool                          `bson:"hideCompleteMaterials" json:"hideCompleteMaterials"`
	DefaultStationIDForAssets        int64                         `bson:"defaultStationIDForAssets" json:"defaultStationIDForAssets"`
	DefaultCitadelBrokersFee         float64                       `bson:"defaultCitadelBrokersFee" json:"defaultCitadelBrokersFee"`
	DefaultMaterialEfficiencyValue   int                           `bson:"defaultMaterialEfficiencyValue" json:"defaultMaterialEfficiencyValue"`
	ShareCitadelNames                bool                          `bson:"shareCitadelNames" json:"shareCitadelNames"`
	CustomStructures                 CustomStructures              `bson:"customStructures" json:"customStructures"`
	ExemptTypeIDs                    []int                         `bson:"exemptTypeIDs" json:"exemptTypeIDs,omitempty"`
	ReprocessingSettings             ReprocessingSettings          `bson:"reprocessingSettings" json:"reprocessingSettings"`
	ExtrasCategories                 []ExtraCategory               `bson:"extrasCategories" json:"extrasCategories,omitempty"`
	PredefinedSystemIndexes          map[string]map[string]float64 `bson:"predefinedSystemIndexes" json:"predefinedSystemIndexes,omitempty"`
	JobStatuses                      map[string]JobStatusEntry     `bson:"jobStatuses" json:"jobStatuses,omitempty"`
	MetaData                         ApplicationSettingsMeta       `bson:"_meta" json:"_meta"`
}
