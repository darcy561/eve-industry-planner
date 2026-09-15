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

// ExtrasCategoryOther is the catch-all a user files a cost under when none of
// the named categories fit.
const ExtrasCategoryOther = "5"

// PermanentExtrasCategoryIDs are the categories every list must keep. Stored
// costs resolve their label against the list they were filed from, so removing
// either of these would leave a cost naming a category nothing lists.
func PermanentExtrasCategoryIDs() []string {
	return []string{ExtrasCategoryUnassigned, ExtrasCategoryOther}
}

// DefaultApplicationSettings returns a full new-account application_settings document for Mongo.
func DefaultApplicationSettings(accountID string, now time.Time) ApplicationSettings {
	return ApplicationSettings{
		SchemaVersion:                    ApplicationSettingsSchemaCurrent,
		DisplayHelpCards:                 false,
		DefaultMarketLocation:            "jita",
		DefaultOrderType:                 "sell",
		DefaultPricing:                   DefaultPricingDefaults(),
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
				Owner:        AccountOwner(accountID),
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

// PricingChoice is a market and which side of its order book a figure comes from.
// It is the shape of an answer at every rung that can give one.
//
// Both axes are called buy and sell and they do not agree. Basis is a listing
// type — buy, sell, buyP95 or sellP05 — so materials being bought are normally
// priced with Basis "sell", because the ask is what buying actually costs.
//
// An empty field is not a choice. Both are omitempty, so an unanswered pair is
// sent as an empty object rather than as empty strings, and a consumer must read
// either as "not answered".
type PricingChoice struct {
	Market string `bson:"market,omitempty" json:"market,omitempty"`
	Basis  string `bson:"basis,omitempty" json:"basis,omitempty"`
}

// PricingSide is one side of the account's defaults: what it prices against, and
// what any market group beneath it prices against instead.
//
// Groups is keyed by market group id and prices everything under that group. It
// lives on the side rather than beside it, so a group can never answer the side
// it was not set on.
// GroupPricing is what one market group is priced against, beneath a side.
//
// It carries a route as well as a basis because a group answers the same question
// its side does: the selling side names how output leaves a build, and a group
// beneath it has to be able to name a different route rather than a basis its own
// side no longer reads. The buying side's groups name a basis and no route.
//
// Kept apart from PricingChoice, which rungs 1 and 2 also use: a job's own
// override and a material's are about where a figure comes from, not about how a
// build is sold, so a route on that type would be a field two rungs could never
// answer.
type GroupPricing struct {
	Market string `bson:"market,omitempty" json:"market,omitempty"`
	Basis  string `bson:"basis,omitempty" json:"basis,omitempty"`
	Exit   string `bson:"exit,omitempty" json:"exit,omitempty"`
}

type PricingSide struct {
	PricingChoice `bson:",inline" json:",inline"`
	Groups        map[string]GroupPricing `bson:"groups,omitempty" json:"groups,omitempty"`
	// Exit is the route out of a finished build — listing it, or selling into
	// bids — and is answered on the selling side only. It decides the basis
	// rather than sitting beside one: a listing is priced from the ask and pays a
	// broker fee, a buy-order sale is priced from the bid and pays none. A stored
	// basis cannot carry that second half, which is why the selling side names a
	// route and derives its basis from it.
	Exit string `bson:"exit,omitempty" json:"exit,omitempty"`
}

// The routes out of a finished build. The buying side never carries one.
const (
	ExitRouteListed    = "listed"
	ExitRouteImmediate = "immediate"
)

// PricingDefaults is what a figure is priced against when nothing nearer has
// said. A material's own override and the panel it sits on both outrank it.
type PricingDefaults struct {
	Buying  PricingSide `bson:"buying" json:"buying"`
	Selling PricingSide `bson:"selling" json:"selling"`
}

// JobPricing is one job's own choice of where each side of it is priced.
//
// It carries no group table: market groups are an account-level rung beneath the
// job, so a job naming one would be answering a question it does not own.
type JobPricing struct {
	// No json omitempty: it does nothing for a struct field, so an empty side is
	// written as `{}` rather than left out. LocalPricing is a pointer for that
	// reason — a job that has chosen nothing omits the whole thing.
	Buying  PricingChoice `bson:"buying,omitempty" json:"buying"`
	Selling PricingChoice `bson:"selling,omitempty" json:"selling"`
}

// DefaultPricingDefaults returns the pricing defaults a new account starts with.
func DefaultPricingDefaults() PricingDefaults {
	buying := PricingSide{Market: "jita", Basis: "sell"}
	selling := PricingSide{Market: "jita", Exit: ExitRouteListed}

	return PricingDefaults{Buying: buying, Selling: selling}
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
	SchemaVersion         int    `bson:"schemaVersion,omitempty" json:"schemaVersion,omitempty"`
	DisplayHelpCards      bool   `bson:"displayHelpCards" json:"displayHelpCards"`
	DefaultMarketLocation string `bson:"defaultMarketLocation" json:"defaultMarketLocation"`
	DefaultOrderType      string `bson:"defaultOrderType" json:"defaultOrderType"`
	// DefaultPricing prices the buying and selling sides of a job separately.
	DefaultPricing                   PricingDefaults `bson:"defaultPricing" json:"defaultPricing"`
	EsiJobTab                        *string         `bson:"esiJobTab,omitempty" json:"esiJobTab,omitempty"`
	EnableCompactLayoutView          bool            `bson:"enableCompactLayoutView" json:"enableCompactLayoutView"`
	EnableAutomaticJobRecalculation  bool            `bson:"enableAutomaticJobRecalculation" json:"enableAutomaticJobRecalculation"`
	EnableSkipMissingBlueprints      bool            `bson:"enableSkipMissingBlueprints" json:"enableSkipMissingBlueprints"`
	HideCompleteMaterialsFromEditJob bool            `bson:"hideCompleteMaterials" json:"hideCompleteMaterials"`
	DefaultStationIDForAssets        int64           `bson:"defaultStationIDForAssets" json:"defaultStationIDForAssets"`
	DefaultCitadelBrokersFee         float64         `bson:"defaultCitadelBrokersFee" json:"defaultCitadelBrokersFee"`
	// DefaultMarketCharacter is whose skills and standings price a sale.
	//
	// Not the character that builds: market skills and the standings grind
	// usually sit on a dedicated trading alt, so deriving the fee from the
	// builder quotes the untrained rate on most accounts. Nil until chosen, and
	// the SPA stands in with the account's main.
	DefaultMarketCharacter         *string                       `bson:"defaultMarketCharacter,omitempty" json:"defaultMarketCharacter,omitempty"`
	DefaultMaterialEfficiencyValue int                           `bson:"defaultMaterialEfficiencyValue" json:"defaultMaterialEfficiencyValue"`
	ShareCitadelNames              bool                          `bson:"shareCitadelNames" json:"shareCitadelNames"`
	CustomStructures               CustomStructures              `bson:"customStructures" json:"customStructures"`
	ExemptTypeIDs                  []int                         `bson:"exemptTypeIDs" json:"exemptTypeIDs,omitempty"`
	ReprocessingSettings           ReprocessingSettings          `bson:"reprocessingSettings" json:"reprocessingSettings"`
	ExtrasCategories               []ExtraCategory               `bson:"extrasCategories" json:"extrasCategories,omitempty"`
	PredefinedSystemIndexes        map[string]map[string]float64 `bson:"predefinedSystemIndexes" json:"predefinedSystemIndexes,omitempty"`
	JobStatuses                    map[string]JobStatusEntry     `bson:"jobStatuses" json:"jobStatuses,omitempty"`
	MetaData                       ApplicationSettingsMeta       `bson:"_meta" json:"_meta"`
}
