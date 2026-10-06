package models

import (
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// JobStatusEntry is one workflow stage in ApplicationSettings.jobStatuses, keyed by status id.
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

// EmptyCustomStructures returns a configuration with no structures in it.
func EmptyCustomStructures() CustomStructures {
	return CustomStructures{}
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

// ExtrasCategoryOther is the catch-all a cost is filed under when no named category fits.
const ExtrasCategoryOther = "5"

// PermanentExtrasCategoryIDs are the categories every list must keep, since stored costs resolve
// their label against the list they were filed from.
func PermanentExtrasCategoryIDs() []string {
	return []string{ExtrasCategoryUnassigned, ExtrasCategoryOther}
}

// DefaultApplicationSettings returns a full new-account application_settings document for Mongo.
func DefaultApplicationSettings(accountID string, now time.Time) ApplicationSettings {
	return ApplicationSettings{
		SchemaVersion:                    ApplicationSettingsSchemaCurrent,
		DisplayHelpCards:                 false,
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
		MarketLocations:                  EmptyMarketLocations(),
		ExemptTypeIDs:                    []int{},
		ReprocessingSettings:             ReprocessingSettings{},
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

// The job types a structure can be configured for, which tell one kind of structure row from
// another; 3 is Planetary Interaction, which nothing here configures.
const (
	JobTypeManufacturing = 1
	JobTypeReaction      = 2
	JobTypeInvention     = 4
	JobTypeReprocessing  = 5
)

// StructureKindMarket is a station or citadel a price is asked for rather than a place a job is
// performed, continuing past the job types in the same field.
const StructureKindMarket = 6

// CustomStructure is one structure a player has configured, of whatever kind; JobType says which,
// and the optional fields are the ones that kind uses.
type CustomStructure struct {
	ID            string  `bson:"id" json:"id"`
	JobType       int     `bson:"jobType" json:"jobType"`
	Name          string  `bson:"name" json:"name"`
	SystemType    int     `bson:"systemType" json:"systemType"`
	StructureType int     `bson:"structureType" json:"structureType"`
	Tax           float64 `bson:"tax" json:"tax"`
	Default       bool    `bson:"default" json:"default"`

	RigType  int   `bson:"rigType,omitempty" json:"rigType,omitzero"`
	RigSlot1 int   `bson:"rigSlot1,omitempty" json:"rigSlot1,omitzero"`
	RigSlot2 int   `bson:"rigSlot2,omitempty" json:"rigSlot2,omitzero"`
	Implant  int   `bson:"implant,omitempty" json:"implant,omitzero"`
	SystemID int64 `bson:"systemID,omitempty" json:"systemID,omitzero"`

	RegionID    int64 `bson:"regionID,omitempty" json:"regionID,omitzero"`
	StationID   int64 `bson:"stationID,omitempty" json:"stationID,omitzero"`
	StructureID int64 `bson:"structureID,omitempty" json:"structureID,omitzero"`

	RaceID  int64 `bson:"raceID,omitempty" json:"raceID,omitzero"`
	OwnerID int64 `bson:"ownerID,omitempty" json:"ownerID,omitzero"`

	BrokerFee float64 `bson:"brokerFee,omitempty" json:"brokerFee,omitzero"`
}

// CustomStructures is every structure a player has configured, of every kind, read from either
// stored shape.
type CustomStructures []CustomStructure

// OfJobType returns the structures configured for one kind, in stored order.
func (c CustomStructures) OfJobType(jobType int) []CustomStructure {
	var found []CustomStructure
	for _, structure := range c {
		if structure.JobType == jobType {
			found = append(found, structure)
		}
	}
	return found
}

// DefaultOfJobType returns the structure a kind defaults to: the one flagged default, else the
// first configured, else nil.
func (c CustomStructures) DefaultOfJobType(jobType int) *CustomStructure {
	var first *CustomStructure
	for i := range c {
		if c[i].JobType != jobType {
			continue
		}
		if c[i].Default {
			return &c[i]
		}
		if first == nil {
			first = &c[i]
		}
	}
	return first
}

// WithID returns the structure with an id, of whatever kind, or nil.
func (c CustomStructures) WithID(id string) *CustomStructure {
	for i := range c {
		if c[i].ID == id {
			return &c[i]
		}
	}
	return nil
}

// customStructureLanes are the keys rows were once stored under, and the kind each key held.
var customStructureLanes = []struct {
	Key     string
	JobType int
}{
	{"manufacturing", JobTypeManufacturing},
	{"reaction", JobTypeReaction},
	{"reprocessing", JobTypeReprocessing},
	{"invention", JobTypeInvention},
}

// UnmarshalBSON reads both stored shapes, an array of rows or the four keyed lists, told apart by
// what BSON says the value is.
func (c *CustomStructures) UnmarshalBSON(data []byte) error {
	if len(data) == 0 {
		*c = nil
		return nil
	}

	var rows []CustomStructure
	if err := bson.UnmarshalValue(bson.TypeArray, data, &rows); err == nil {
		*c = rows
		return nil
	}

	var lanes map[string][]CustomStructure
	if err := bson.Unmarshal(data, &lanes); err != nil {
		return err
	}
	folded := CustomStructures{}
	for _, lane := range customStructureLanes {
		for _, structure := range lanes[lane.Key] {
			if structure.JobType == 0 {
				structure.JobType = lane.JobType
			}
			folded = append(folded, structure)
		}
	}
	*c = folded
	return nil
}

// ExtraCategory is one category an extra cost is filed under.
type ExtraCategory struct {
	ID        string  `bson:"id" json:"id"`
	Label     string  `bson:"label" json:"label"`
	Deleted   bool    `bson:"deleted" json:"deleted"`
	DeletedAt *string `bson:"deletedAt" json:"deletedAt"`
}

// ReprocessingSettings is the account's own part of reprocessing: whose skills set the yield, nil
// until chosen.
type ReprocessingSettings struct {
	DefaultReprocessingCharacter *string `bson:"defaultReprocessingCharacter,omitempty" json:"defaultReprocessingCharacter,omitempty"`
}

// PricingChoice is a market and which side of its order book a figure comes from; OrderType is
// named as ESI names it, and an empty field is not a choice.
type PricingChoice struct {
	Market    string `bson:"market,omitempty" json:"market,omitempty"`
	OrderType string `bson:"orderType,omitempty" json:"orderType,omitempty"`
}

type GroupPricing struct {
	Market    string `bson:"market,omitempty" json:"market,omitempty"`
	OrderType string `bson:"orderType,omitempty" json:"orderType,omitempty"`
	Exit      string `bson:"exit,omitempty" json:"exit,omitempty"`
}

// PricingSide is one side of the account's defaults, what it prices against, and what any market
// group beneath it prices against instead; Exit is answered on the selling side only.
type PricingSide struct {
	PricingChoice `bson:",inline" json:",inline"`
	Groups        map[string]GroupPricing `bson:"groups,omitempty" json:"groups,omitempty"`
	Exit          string                  `bson:"exit,omitempty" json:"exit,omitempty"`
}

// The routes out of a finished build; the buying side never carries one.
const (
	ExitRouteListed    = "listed"
	ExitRouteImmediate = "immediate"
)

// PricingDefaults is what a figure is priced against when nothing nearer has said.
type PricingDefaults struct {
	Buying  PricingSide `bson:"buying" json:"buying"`
	Selling PricingSide `bson:"selling" json:"selling"`
}

// JobPricing is one job's own choice of where each side of it is priced.
type JobPricing struct {
	Buying  PricingChoice `bson:"buying,omitempty" json:"buying"`
	Selling PricingChoice `bson:"selling,omitempty" json:"selling"`
}

// DefaultPricingDefaults returns the pricing defaults a new account starts with.
func DefaultPricingDefaults() PricingDefaults {
	buying := PricingSide{Market: DefaultHubID, OrderType: "sell"}
	selling := PricingSide{Market: DefaultHubID, Exit: ExitRouteListed}

	return PricingDefaults{Buying: buying, Selling: selling}
}

// LinkedCharacterSession is a cloud-mode additional character's short-lived access session,
// returned at login and auth refresh.
type LinkedCharacterSession struct {
	CharacterHash string `json:"characterHash"`
	AccessToken   string `json:"access_token"`
	TokenType     string `json:"token_type"`
	ExpiresIn     int    `json:"expires_in"`
}

// ApplicationSettingsMeta holds the document metadata under `_meta`.
type ApplicationSettingsMeta struct {
	MetaData `json:",inline" bson:",inline"`
}

// ApplicationSettings is the settings that decide how one account sees its own screen.
type ApplicationSettings struct {
	SchemaVersion                    int                           `bson:"schemaVersion,omitempty" json:"schemaVersion,omitempty"`
	DisplayHelpCards                 bool                          `bson:"displayHelpCards" json:"displayHelpCards"`
	DefaultPricing                   PricingDefaults               `bson:"defaultPricing" json:"defaultPricing"`
	EsiJobTab                        *string                       `bson:"esiJobTab,omitempty" json:"esiJobTab,omitempty"`
	EnableCompactLayoutView          bool                          `bson:"enableCompactLayoutView" json:"enableCompactLayoutView"`
	EnableAutomaticJobRecalculation  bool                          `bson:"enableAutomaticJobRecalculation" json:"enableAutomaticJobRecalculation"`
	EnableSkipMissingBlueprints      bool                          `bson:"enableSkipMissingBlueprints" json:"enableSkipMissingBlueprints"`
	HideCompleteMaterialsFromEditJob bool                          `bson:"hideCompleteMaterials" json:"hideCompleteMaterials"`
	DefaultStationIDForAssets        int64                         `bson:"defaultStationIDForAssets" json:"defaultStationIDForAssets"`
	DefaultCitadelBrokersFee         float64                       `bson:"defaultCitadelBrokersFee" json:"defaultCitadelBrokersFee"`
	DefaultMarketCharacter           *string                       `bson:"defaultMarketCharacter,omitempty" json:"defaultMarketCharacter,omitempty"`
	DefaultMaterialEfficiencyValue   int                           `bson:"defaultMaterialEfficiencyValue" json:"defaultMaterialEfficiencyValue"`
	ShareCitadelNames                bool                          `bson:"shareCitadelNames" json:"shareCitadelNames"`
	CustomStructures                 CustomStructures              `bson:"customStructures" json:"customStructures"`
	MarketLocations                  MarketLocations               `bson:"marketLocations" json:"marketLocations"`
	ExemptTypeIDs                    []int                         `bson:"exemptTypeIDs" json:"exemptTypeIDs,omitempty"`
	ReprocessingSettings             ReprocessingSettings          `bson:"reprocessingSettings" json:"reprocessingSettings"`
	ExtrasCategories                 []ExtraCategory               `bson:"extrasCategories" json:"extrasCategories,omitempty"`
	PredefinedSystemIndexes          map[string]map[string]float64 `bson:"predefinedSystemIndexes" json:"predefinedSystemIndexes,omitempty"`
	JobStatuses                      map[string]JobStatusEntry     `bson:"jobStatuses" json:"jobStatuses,omitempty"`
	MetaData                         ApplicationSettingsMeta       `bson:"_meta" json:"_meta"`
}
