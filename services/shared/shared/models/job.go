package models

import (
	"encoding/json"
	"time"

	"go.mongodb.org/mongo-driver/bson"
)

// Job represents a complete EVE Online industry job with all nested data structures.
// This model is shared across services for job data consistency.
// Ownership and lifecycle (account, archive, delete flags) live on MetaData (`_meta`), not root fields.
type Job struct {
	SchemaVersion       int         `json:"schemaVersion,omitempty" bson:"schemaVersion,omitempty"`
	DisplayOnPlanner    bool        `json:"displayOnPlanner" bson:"displayOnPlanner"`
	IncludedInGroup     bool        `json:"includedInGroup" bson:"includedInGroup"`
	MetaLevel           *int        `json:"metaLevel" bson:"metaLevel"`
	JobType             int         `json:"jobType" bson:"jobType"`
	Name                string      `json:"name" bson:"name"`
	JobID               string      `json:"jobID" bson:"jobID"`
	JobStatus           int         `json:"jobStatus" bson:"jobStatus"`
	Volume              float64     `json:"volume" bson:"volume"`
	ItemID              int         `json:"itemID" bson:"itemID"`
	MaxProductionLimit  int         `json:"maxProductionLimit" bson:"maxProductionLimit"`
	APIJobs             []int       `json:"apiJobs" bson:"apiJobs"`
	APIOrders           []int       `json:"apiOrders" bson:"apiOrders"`
	APITransactions     []int       `json:"apiTransactions" bson:"apiTransactions"`
	ParentJobs          []string    `json:"parentJobs" bson:"parentJobs"` // canonical document key (Firestore exports may use parentJob; normalizer rewrites)
	BlueprintTypeID     *int        `json:"blueprintTypeID" bson:"blueprintTypeID"`
	GroupID             string      `json:"groupID" bson:"groupID"` // empty string when not in a group
	IsReadyToSell       bool        `json:"isReadyToSell" bson:"isReadyToSell"`
	Build               JobBuild    `json:"build" bson:"build"`
	RawData             RawData     `json:"rawData" bson:"rawData"`
	Skills              []Skill     `json:"skills" bson:"skills"`
	ItemsProducedPerRun int         `json:"itemsProducedPerRun" bson:"itemsProducedPerRun"`
	Layout              JobLayout   `json:"layout" bson:"layout"`
	MetaData            JobMetaData `json:"_meta" bson:"_meta"`
}

// JobBuild contains all build-related data including setups, costs, and sales
type JobBuild struct {
	Setup     map[string]JobSetup `json:"setup" bson:"setup"`
	Products  JobProducts         `json:"products" bson:"products"`
	Costs     JobCosts            `json:"costs" bson:"costs"`
	Sale      JobSale             `json:"sale" bson:"sale"`
	Materials []JobMaterial       `json:"materials" bson:"materials"`
	ChildJobs map[string][]string `json:"childJobs" bson:"childJobs"`
}

// JobSetup represents a single setup configuration for a job
type JobSetup struct {
	ID                             string                   `json:"id" bson:"id"`
	RunCount                       int                      `json:"runCount" bson:"runCount"`
	JobCount                       int                      `json:"jobCount" bson:"jobCount"`
	ME                             int                      `json:"ME" bson:"ME"`
	TE                             int                      `json:"TE" bson:"TE"`
	StructureID                    int                      `json:"structureID" bson:"structureID"`
	RigID                          int                      `json:"rigID" bson:"rigID"`
	SystemTypeID                   int                      `json:"systemTypeID" bson:"systemTypeID"`
	SystemID                       int                      `json:"systemID" bson:"systemID"`
	TaxValue                       float64                  `json:"taxValue" bson:"taxValue"`
	EstimatedInstallCost           float64                  `json:"estimatedInstallCost" bson:"estimatedInstallCost"`
	CustomStructureID              string                   `json:"customStructureID" bson:"customStructureID"`
	SelectedCharacter              string                   `json:"selectedCharacter" bson:"selectedCharacter"`
	MaterialCount                  map[string]MaterialCount `json:"materialCount" bson:"materialCount"`
	EstimatedTime                  float64                  `json:"estimatedTime" bson:"estimatedTime"`
	RawTime                        float64                  `json:"rawTime" bson:"rawTime"`
	JobType                        int                      `json:"jobType" bson:"jobType"`
	AppliedRequirementID           int64                    `json:"appliedRequirementID" bson:"appliedRequirementID"`
	AlternativeSystemIndexValue    float64                  `json:"alternativeSystemIndexValue" bson:"alternativeSystemIndexValue"`
	UseAlternativeSystemIndexValue bool                     `json:"useAlternativeSystemIndexValue" bson:"useAlternativeSystemIndexValue"`
}

// MaterialCount represents material quantity tracking in a setup (whole units only).
// Legacy Firestore floats are rounded during archiveimport (fillSetupMaterialCount).
type MaterialCount struct {
	TypeID      int `json:"typeID" bson:"typeID"`
	Quantity    int `json:"quantity" bson:"quantity"`
	RawQuantity int `json:"rawQuantity" bson:"rawQuantity"`
}

// JobProducts contains product quantity information (whole units).
// Legacy fractional totalQuantity values are rounded in archiveimport.normalizeProductsTotalQuantity.
type JobProducts struct {
	TotalQuantity int `json:"totalQuantity" bson:"totalQuantity"`
}

// JobCosts contains all cost-related data for the job
type JobCosts struct {
	TotalPurchaseCost float64          `json:"totalPurchaseCost" bson:"totalPurchaseCost"`
	ExtrasCosts       []ExtraCost      `json:"extrasCosts" bson:"extrasCosts"`
	ExtrasTotal       float64          `json:"extrasTotal" bson:"extrasTotal"`
	LinkedJobs        []LinkedESIJob   `json:"linkedJobs" bson:"linkedJobs"`
	InstallCosts      float64          `json:"installCosts" bson:"installCosts"`
	InventionCosts    float64          `json:"inventionCosts" bson:"inventionCosts"`
	InventionEntries  []InventionEntry `json:"inventionEntries" bson:"inventionEntries"`
}

// ExtraCost matches the SPA extras row (Extras panel, Job.toDocument): id, category, extraText, extraValue.
// category is a string in API and stored jobs. Legacy Firestore (numeric category, type/label/cost) is rewritten
// only in archiveimport.normalizeExtrasCosts during migration/import, not at runtime decode.
type ExtraCost struct {
	ID         string  `json:"id" bson:"id"`
	Category   string  `json:"category" bson:"category"`
	ExtraText  string  `json:"extraText" bson:"extraText"`
	ExtraValue float64 `json:"extraValue" bson:"extraValue"`
}

// LinkedESIJob represents a linked ESI job from EVE Online API
// Matches the LinkedESIJob class from frontend Classes/linkedESIJob.js
type LinkedESIJob struct {
	Status          string  `json:"status" bson:"status"`                                     // Job status (active, completed, etc.)
	CharacterHash   string  `json:"CharacterHash,omitempty" bson:"CharacterHash,omitempty"`   // Character hash of the owner
	Runs            int     `json:"runs" bson:"runs"`                                         // Number of runs
	JobID           int     `json:"job_id" bson:"job_id"`                                     // ESI job ID
	CompletedDate   string  `json:"completed_date,omitempty" bson:"completed_date,omitempty"` // RFC3339-ish; legacy null/number normalized in archiveimport
	StationID       int     `json:"station_id" bson:"station_id"`                             // Facility/station ID
	StartDate       string  `json:"start_date" bson:"start_date"`                             // Start date
	EndDate         string  `json:"end_date" bson:"end_date"`                                 // End date
	Cost            float64 `json:"cost" bson:"cost"`                                         // Installation cost
	BlueprintTypeID int     `json:"blueprint_type_id" bson:"blueprint_type_id"`               // Blueprint type ID
	ProductTypeID   int     `json:"product_type_id" bson:"product_type_id"`                   // Product type ID
	ActivityID      int     `json:"activity_id" bson:"activity_id"`                           // Activity ID
	Duration        int     `json:"duration" bson:"duration"`                                 // Duration in seconds
	BlueprintID     int     `json:"blueprint_id" bson:"blueprint_id"`                         // Blueprint ID
	IsCorporation   bool    `json:"is_corporation" bson:"is_corporation"`                     // Whether it's a corporation job
	CorporationID   int     `json:"corporation_id,omitempty" bson:"corporation_id,omitempty"` // zero = none; legacy null/string normalized in archiveimport
	JobType         int     `json:"job_type" bson:"job_type"`                                 // Job type
}

// InventionEntry represents invention-related costs
// Matches the structure used in addInventionCost in frontend Classes/job.js
type InventionEntry struct {
	ID       int64   `json:"id" bson:"id"`             // Unique identifier (timestamp from Date.now())
	ItemName string  `json:"itemName" bson:"itemName"` // Name of the invention item
	ItemCost float64 `json:"itemCost" bson:"itemCost"` // Cost of the invention item
}

// JobSale contains sales and market order data
type JobSale struct {
	TotalSold    float64       `json:"totalSold" bson:"totalSold"`
	TotalSale    float64       `json:"totalSale" bson:"totalSale"`
	MarketOrders []MarketOrder `json:"marketOrders" bson:"marketOrders"`
	Transactions []Transaction `json:"transactions" bson:"transactions"`
	BrokersFee   []BrokerFee   `json:"brokersFee" bson:"brokersFee"`
}

// MarketOrder represents a market order for selling products
// Matches the structure created by createESIMarketOrder in createMarketOrder.js
type MarketOrder struct {
	Duration      int      `json:"duration" bson:"duration"`                               // Order duration in days
	IsCorporation bool     `json:"is_corporation" bson:"is_corporation"`                   // Whether this is a corporation order
	Issued        string   `json:"issued" bson:"issued"`                                   // Order issue timestamp
	LocationID    int      `json:"location_id" bson:"location_id"`                         // Location ID where order is placed
	OrderID       int      `json:"order_id" bson:"order_id"`                               // Unique order ID
	ItemPrice     float64  `json:"item_price" bson:"item_price"`                           // Order price per unit
	Range         string   `json:"range" bson:"range"`                                     // ESI string (e.g. "region"); legacy non-strings normalized in archiveimport
	RegionID      int      `json:"region_id" bson:"region_id"`                             // Region ID where order is placed
	TypeID        int      `json:"type_id" bson:"type_id"`                                 // Item type ID
	VolumeRemain  int      `json:"volume_remain" bson:"volume_remain"`                     // Remaining volume
	VolumeTotal   int      `json:"volume_total" bson:"volume_total"`                       // Total volume
	TimeStamps    []string `json:"timeStamps" bson:"timeStamps"`                           // Array of timestamp history
	CharacterHash string   `json:"CharacterHash,omitempty" bson:"CharacterHash,omitempty"` // Character hash for identification
	Complete      bool     `json:"complete" bson:"complete"`                               // Whether order is complete
	State         string   `json:"state" bson:"state"`                                     // Order state (active, etc.)
}

// Transaction represents a completed market transaction
// Matches the structure created by createTransaction in createTransaction.js
type Transaction struct {
	OrderID       int     `json:"order_id,omitempty" bson:"order_id,omitempty"`           // zero = none; legacy null/string/float normalized in archiveimport
	JournalRefID  int64   `json:"journal_ref_id" bson:"journal_ref_id"`                   // Journal reference ID
	UnitPrice     float64 `json:"unit_price" bson:"unit_price"`                           // Price per unit
	Amount        float64 `json:"amount" bson:"amount"`                                   // Transaction amount
	Tax           float64 `json:"tax" bson:"tax"`                                         // Tax amount
	TransactionID int64   `json:"transaction_id" bson:"transaction_id"`                   // ESI id; string/float historic imports normalized in archiveimport
	Quantity      int     `json:"quantity" bson:"quantity"`                               // Quantity of items
	Date          string  `json:"date" bson:"date"`                                       // Transaction date
	LocationID    int     `json:"location_id" bson:"location_id"`                         // Location ID
	IsCorp        bool    `json:"is_corp" bson:"is_corp"`                                 // Whether it's a corporation transaction
	TypeID        int     `json:"type_id" bson:"type_id"`                                 // Item type ID
	Description   string  `json:"description" bson:"description"`                         // Transaction description
	CharacterHash string  `json:"CharacterHash,omitempty" bson:"CharacterHash,omitempty"` // Character hash for identification
}

// BrokerFee represents broker fees for market orders
// Matches the structure created by ESIBrokerFee in findBrokersFeeEntry.js
type BrokerFee struct {
	OrderID       int     `json:"order_id" bson:"order_id"`                               // Order ID associated with the fee
	ID            int64   `json:"id" bson:"id"`                                           // Journal entry ID
	Complete      bool    `json:"complete" bson:"complete"`                               // Whether the fee is complete
	Date          string  `json:"date" bson:"date"`                                       // Fee date
	Amount        float64 `json:"amount" bson:"amount"`                                   // Fee amount
	CharacterHash string  `json:"CharacterHash,omitempty" bson:"CharacterHash,omitempty"` // Character hash for identification
}

// JobMaterial represents a material required for the job
type JobMaterial struct {
	TypeID            int        `json:"typeID" bson:"typeID"`
	Name              string     `json:"name" bson:"name"`
	Quantity          int        `json:"quantity" bson:"quantity"` // rounded on historic import (archiveimport.normalizePurchasing)
	JobType           int        `json:"jobType" bson:"jobType"`
	Volume            float64    `json:"volume" bson:"volume"` // coerced on historic import
	Purchasing        []Purchase `json:"purchasing" bson:"purchasing"`
	QuantityPurchased int        `json:"quantityPurchased" bson:"quantityPurchased"` // rounded on historic import
	PurchasedCost     float64    `json:"purchasedCost" bson:"purchasedCost"`         // coerced on historic import
	PurchaseComplete  bool       `json:"purchaseComplete" bson:"purchaseComplete"`
}

// Purchase represents a material purchase transaction.
// Matches useBuildMaterialPriceObject / material purchasing rows in frontend Classes/job.js (typeID duplicates parent material for UI).
type Purchase struct {
	TypeID         int     `json:"typeID" bson:"typeID"`                       // EVE type id (frontend includes on each row); zero encodes as 0 when unknown
	ID             string  `json:"id" bson:"id"`                               // UUID identifier
	ChildID        string  `json:"childID,omitempty" bson:"childID,omitempty"` // Child job id; empty if none; normalized in archiveimport.normalizePurchasing
	ChildJobImport bool    `json:"childJobImport" bson:"childJobImport"`       // Whether this purchase is imported from a child job
	ItemCount      int     `json:"itemCount" bson:"itemCount"`                 // Rounded on historic import (archiveimport.normalizePurchasing)
	ItemCost       float64 `json:"itemCost" bson:"itemCost"`                   // Coerced on historic import
}

// RawData contains the raw EVE API data for materials, products, and time
type RawData struct {
	Materials []RawMaterial `json:"materials" bson:"materials"`
	Products  []RawProduct  `json:"products" bson:"products"`
	Time      int           `json:"time" bson:"time"`
}

// RawMaterial represents a material from EVE API raw data
type RawMaterial struct {
	JobType  int     `json:"jobType" bson:"jobType"`
	Name     string  `json:"name" bson:"name"`
	Quantity int     `json:"quantity" bson:"quantity"`
	TypeID   int     `json:"typeID" bson:"typeID"`
	Volume   float64 `json:"volume" bson:"volume"`
}

// RawProduct represents a product from EVE API raw data
type RawProduct struct {
	Quantity int `json:"quantity" bson:"quantity"`
	TypeID   int `json:"typeID" bson:"typeID"`
}

// Skill represents a required skill for the job
type Skill struct {
	TypeID int `json:"typeID" bson:"typeID"`
	Level  int `json:"level" bson:"level"`
}

// JobLayout contains UI layout preferences. Per-job market/order overrides use `local*` names;
// application-wide defaults live on ApplicationSettings as defaultMarketLocation/defaultOrderType.
type JobLayout struct {
	LocalMarketDisplay  string `json:"localMarketDisplay,omitempty" bson:"localMarketDisplay,omitempty"`
	LocalOrderDisplay   string `json:"localOrderDisplay,omitempty" bson:"localOrderDisplay,omitempty"`
	ESIJobTab           string `json:"esiJobTab,omitempty" bson:"esiJobTab,omitempty"`
	SetupToEdit         string `json:"setupToEdit,omitempty" bson:"setupToEdit,omitempty"`
	ResourceDisplayType string `json:"resourceDisplayType,omitempty" bson:"resourceDisplayType,omitempty"`
}

// UnmarshalBSON prefers local*; if empty, accepts short-lived marketLocation/orderType keys into local* fields.
func (l *JobLayout) UnmarshalBSON(data []byte) error {
	var aux struct {
		LocalMarketDisplay  string `bson:"localMarketDisplay"`
		LocalOrderDisplay   string `bson:"localOrderDisplay"`
		MarketLocation      string `bson:"marketLocation"`
		OrderType           string `bson:"orderType"`
		ESIJobTab           string `bson:"esiJobTab"`
		SetupToEdit         string `bson:"setupToEdit"`
		ResourceDisplayType string `bson:"resourceDisplayType"`
	}
	if err := bson.Unmarshal(data, &aux); err != nil {
		return err
	}
	l.LocalMarketDisplay = aux.LocalMarketDisplay
	if l.LocalMarketDisplay == "" {
		l.LocalMarketDisplay = aux.MarketLocation
	}
	l.LocalOrderDisplay = aux.LocalOrderDisplay
	if l.LocalOrderDisplay == "" {
		l.LocalOrderDisplay = aux.OrderType
	}
	l.ESIJobTab = aux.ESIJobTab
	l.SetupToEdit = aux.SetupToEdit
	l.ResourceDisplayType = aux.ResourceDisplayType
	return nil
}

// UnmarshalJSON prefers local*; if empty, accepts short-lived marketLocation/orderType keys into local* fields.
func (l *JobLayout) UnmarshalJSON(data []byte) error {
	var aux struct {
		LocalMarketDisplay  string `json:"localMarketDisplay"`
		LocalOrderDisplay   string `json:"localOrderDisplay"`
		MarketLocation      string `json:"marketLocation"`
		OrderType           string `json:"orderType"`
		ESIJobTab           string `json:"esiJobTab"`
		SetupToEdit         string `json:"setupToEdit"`
		ResourceDisplayType string `json:"resourceDisplayType"`
	}
	if err := json.Unmarshal(data, &aux); err != nil {
		return err
	}
	l.LocalMarketDisplay = aux.LocalMarketDisplay
	if l.LocalMarketDisplay == "" {
		l.LocalMarketDisplay = aux.MarketLocation
	}
	l.LocalOrderDisplay = aux.LocalOrderDisplay
	if l.LocalOrderDisplay == "" {
		l.LocalOrderDisplay = aux.OrderType
	}
	l.ESIJobTab = aux.ESIJobTab
	l.SetupToEdit = aux.SetupToEdit
	l.ResourceDisplayType = aux.ResourceDisplayType
	return nil
}

type JobMetaData struct {
	MetaData         `json:",inline" bson:",inline"`
	CreatedAt        time.Time `json:"createdAt" bson:"createdAt"`
	LastUpdatedBy    string    `json:"lastUpdatedBy" bson:"lastUpdatedBy"`
	ArchivedAt       time.Time `json:"archivedAt,omitzero" bson:"archivedAt,omitzero"`
	ArchivedBy       string    `json:"archivedBy,omitempty" bson:"archivedBy,omitempty"`
	ArchiveProcessed bool      `json:"archiveProcessed,omitempty" bson:"archiveProcessed,omitempty"`
	DeletedAt        time.Time `json:"deletedAt,omitzero" bson:"deletedAt,omitzero"`
	DeletedBy        string    `json:"deletedBy,omitempty" bson:"deletedBy,omitempty"`
}
