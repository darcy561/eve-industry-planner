package models

import (
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

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

// EmptyCustomStructures returns a configuration with no structures in it.
func EmptyCustomStructures() CustomStructures {
	return CustomStructures{}
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
		DefaultMarketLocation:            DefaultHubID,
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
		MarketLocations:                  EmptyMarketLocations(),
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

// Job types a structure can be configured for. A structure row names its kind in
// JobType, so these are what tells one kind of row from another. The gap at 3 is
// Planetary Interaction, which the SPA names and nothing here configures a
// structure for.
const (
	JobTypeManufacturing = 1
	JobTypeReaction      = 2
	JobTypeInvention     = 4
	JobTypeReprocessing  = 5
)

// StructureKindMarket is a place a price is asked for rather than a place a job
// is performed.
//
// It shares the JobType field with the job types above, because a structure's
// kind has always been stored there, but it is not a job type: nothing asking
// what work a character is doing should be offered a market as an answer. The
// value continues past the job types so a row is unambiguous either way.
//
// One kind covers both an NPC station and a citadel. Which a row is follows
// from whether it holds a StationID or a StructureID, and those are told apart
// by the range an EVE location id falls in.
const StructureKindMarket = 6

// CustomStructure is one structure a player has configured, of whatever kind.
//
// JobType is what says which kind — one of the job types or the structure kinds
// above — and the optional fields below are the ones that kind uses; the rest
// stay at their zero values. Adding a kind is a value and whatever fields it
// needs, not another list.
type CustomStructure struct {
	ID            string  `bson:"id" json:"id"`
	JobType       int     `bson:"jobType" json:"jobType"`
	Name          string  `bson:"name" json:"name"`
	SystemType    int     `bson:"systemType" json:"systemType"`
	StructureType int     `bson:"structureType" json:"structureType"`
	Tax           float64 `bson:"tax" json:"tax"`
	Default       bool    `bson:"default" json:"default"`

	// Used by the kinds that have them; zero elsewhere.
	RigType  int   `bson:"rigType,omitempty" json:"rigType,omitzero"`
	RigSlot1 int   `bson:"rigSlot1,omitempty" json:"rigSlot1,omitzero"`
	RigSlot2 int   `bson:"rigSlot2,omitempty" json:"rigSlot2,omitzero"`
	Implant  int   `bson:"implant,omitempty" json:"implant,omitzero"`
	SystemID int64 `bson:"systemID,omitempty" json:"systemID,omitzero"`

	// The market kinds. A price is asked for per region and then narrowed to one
	// location, so both name a region; StationID or StructureID is what narrows
	// it, and which one a row carries is what its JobType already says.
	RegionID    int64 `bson:"regionID,omitempty" json:"regionID,omitzero"`
	StationID   int64 `bson:"stationID,omitempty" json:"stationID,omitzero"`
	StructureID int64 `bson:"structureID,omitempty" json:"structureID,omitzero"`

	// What the broker fee at an NPC station is worked out from: the race that
	// built it names the faction a standing is held against, and the owner is the
	// corporation holding the other. Both are fixed for the life of the station,
	// so they are stored with it rather than fetched on every quote.
	RaceID  int64 `bson:"raceID,omitempty" json:"raceID,omitzero"`
	OwnerID int64 `bson:"ownerID,omitempty" json:"ownerID,omitzero"`

	// A citadel's broker fee is the rate its owner set, which nothing can derive.
	// An NPC station's is worked out from the seller's skills and standings, so
	// storing one there would let a saved number stand in for that derivation and
	// quote the untrained rate without saying so.
	BrokerFee float64 `bson:"brokerFee,omitempty" json:"brokerFee,omitzero"`
}

// CustomStructures is every structure a player has configured, of every kind.
//
// Rows were once split across four keyed lists, and documents written that way
// are still stored; UnmarshalBSON reads either shape, so a caller that wants one
// kind filters on JobType rather than choosing a list.
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

// DefaultOfJobType returns the structure a kind defaults to: the one flagged
// default, else the first configured, else nil when the kind has none.
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

// customStructureLanes are the keys rows were stored under before a row's own
// JobType was what said which kind it is, and the kind each key held. A row read
// from one is stamped with its kind where the row does not name its own.
var customStructureLanes = []struct {
	Key     string
	JobType int
}{
	{"manufacturing", JobTypeManufacturing},
	{"reaction", JobTypeReaction},
	{"reprocessing", JobTypeReprocessing},
	{"invention", JobTypeInvention},
}

// UnmarshalBSON reads both stored shapes: an array of rows, or the four keyed
// lists rows were written under before that.
//
// The two are told apart by what BSON says the value is, not by a schema
// version: the document carrying these is stamped current on read when it has no
// version of its own, so a version test would miss exactly the documents that
// need folding.
func (c *CustomStructures) UnmarshalBSON(data []byte) error {
	// A document written with no structures at all stores null, which is neither
	// an array of rows nor the keyed lists.
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
			// A row written before its kind was stored names nothing; the list it
			// was found in is the only thing that says what it is.
			if structure.JobType == 0 {
				structure.JobType = lane.JobType
			}
			folded = append(folded, structure)
		}
	}
	*c = folded
	return nil
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
// OrderType is named as ESI names it and takes one of buy, sell, buyP95 or
// sellP05. It and the side being priced are both called buy and sell, and they do
// not agree: materials being bought are normally priced with OrderType "sell",
// because the ask is what buying actually costs.
//
// An empty field is not a choice. Both are omitempty, so an unanswered pair is
// sent as an empty object rather than as empty strings, and a consumer must read
// either as "not answered".
type PricingChoice struct {
	Market    string `bson:"market,omitempty" json:"market,omitempty"`
	OrderType string `bson:"orderType,omitempty" json:"orderType,omitempty"`
}

// PricingSide is one side of the account's defaults: what it prices against, and
// what any market group beneath it prices against instead.
//
// Groups is keyed by market group id and prices everything under that group. It
// lives on the side rather than beside it, so a group can never answer the side
// it was not set on.
// GroupPricing is what one market group is priced against, beneath a side.
//
// It carries a route as well as an order type because a group answers the same question
// its side does: the selling side names how output leaves a build, and a group
// beneath it has to be able to name a different route rather than an order type its own
// side no longer reads. The buying side's groups name an order type and no route.
//
// Kept apart from PricingChoice, which rungs 1 and 2 also use: a job's own
// override and a material's are about where a figure comes from, not about how a
// build is sold, so a route on that type would be a field two rungs could never
// answer.
type GroupPricing struct {
	Market    string `bson:"market,omitempty" json:"market,omitempty"`
	OrderType string `bson:"orderType,omitempty" json:"orderType,omitempty"`
	Exit      string `bson:"exit,omitempty" json:"exit,omitempty"`
}

type PricingSide struct {
	PricingChoice `bson:",inline" json:",inline"`
	Groups        map[string]GroupPricing `bson:"groups,omitempty" json:"groups,omitempty"`
	// Exit is the route out of a finished build — listing it, or selling into
	// bids — and is answered on the selling side only. It decides the order type
	// rather than sitting beside one: a listing is priced from the ask and pays a
	// broker fee, a buy-order sale is priced from the bid and pays none. A stored
	// order type cannot carry that second half, which is why the selling side names a
	// route and derives its order type from it.
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
	buying := PricingSide{Market: DefaultHubID, OrderType: "sell"}
	selling := PricingSide{Market: DefaultHubID, Exit: ExitRouteListed}

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
	MarketLocations                MarketLocations               `bson:"marketLocations" json:"marketLocations"`
	ExemptTypeIDs                  []int                         `bson:"exemptTypeIDs" json:"exemptTypeIDs,omitempty"`
	ReprocessingSettings           ReprocessingSettings          `bson:"reprocessingSettings" json:"reprocessingSettings"`
	ExtrasCategories               []ExtraCategory               `bson:"extrasCategories" json:"extrasCategories,omitempty"`
	PredefinedSystemIndexes        map[string]map[string]float64 `bson:"predefinedSystemIndexes" json:"predefinedSystemIndexes,omitempty"`
	JobStatuses                    map[string]JobStatusEntry     `bson:"jobStatuses" json:"jobStatuses,omitempty"`
	MetaData                       ApplicationSettingsMeta       `bson:"_meta" json:"_meta"`
}
