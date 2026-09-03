package models

import (
	"bytes"
	"encoding/json"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// Job represents a complete EVE Online industry job with all nested data structures.
// This model is shared across services for job data consistency.
// Ownership and lifecycle (account, archive, delete flags) live on MetaData (`_meta`), not root fields.
type Job struct {
	SchemaVersion       int              `json:"schemaVersion,omitempty" bson:"schemaVersion,omitempty"`
	DisplayOnPlanner    bool             `json:"displayOnPlanner" bson:"displayOnPlanner"`
	IncludedInGroup     bool             `json:"includedInGroup" bson:"includedInGroup"`
	MetaLevel           *int             `json:"metaLevel" bson:"metaLevel"`
	JobType             int              `json:"jobType" bson:"jobType"`
	Name                string           `json:"name" bson:"name"`
	JobID               string           `json:"jobID" bson:"jobID"`
	JobStatus           int              `json:"jobStatus" bson:"jobStatus"`
	Volume              float64          `json:"volume" bson:"volume"`
	ItemID              int              `json:"itemID" bson:"itemID"`
	MaxProductionLimit  int              `json:"maxProductionLimit" bson:"maxProductionLimit"`
	APIJobs             []int            `json:"apiJobs" bson:"apiJobs"`
	APIOrders           []int            `json:"apiOrders" bson:"apiOrders"`
	APITransactions     []int            `json:"apiTransactions" bson:"apiTransactions"`
	ParentJobs          []string         `json:"parentJobs" bson:"parentJobs"` // canonical document key (Firestore exports may use parentJob; normalizer rewrites)
	BlueprintTypeID     *int             `json:"blueprintTypeID" bson:"blueprintTypeID"`
	GroupID             string           `json:"groupID" bson:"groupID"` // empty string when not in a group
	IsReadyToSell       bool             `json:"isReadyToSell" bson:"isReadyToSell"`
	Build               JobBuild         `json:"build" bson:"build"`
	RawData             RawData          `json:"rawData" bson:"rawData"`
	Skills              []Skill          `json:"skills" bson:"skills"`
	ItemsProducedPerRun int              `json:"itemsProducedPerRun" bson:"itemsProducedPerRun"`
	Layout              JobLayout        `json:"layout" bson:"layout"`
	Protected           *FieldProtection `json:"-" bson:"protected,omitempty"`
	MetaData            JobMetaData      `json:"_meta" bson:"_meta"`
}

// JobBuild contains all build-related data including setups, costs, and sales
type JobBuild struct {
	Setup     map[string]JobSetup `json:"setup" bson:"setup"`
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

// MaterialQuantity is how many of a material this setup calls for.
// JobSetup#materialQuantity in the SPA is the same method.
func (s JobSetup) MaterialQuantity(typeID int) int {
	return s.MaterialCount[strconv.Itoa(typeID)].Quantity
}

// MaterialCount represents material quantity tracking in a setup (whole units only).
// Legacy Firestore floats are rounded during archiveimport (fillSetupMaterialCount).
type MaterialCount struct {
	TypeID      int `json:"typeID" bson:"typeID"`
	Quantity    int `json:"quantity" bson:"quantity"`
	RawQuantity int `json:"rawQuantity" bson:"rawQuantity"`
}

// JobCosts contains all cost-related data for the job
type JobCosts struct {
	ExtrasCosts      []ExtraCost      `json:"extrasCosts" bson:"extrasCosts"`
	LinkedJobs       []LinkedESIJob   `json:"linkedJobs" bson:"linkedJobs"`
	InventionEntries []InventionEntry `json:"inventionEntries" bson:"inventionEntries"`
}

// JobCostParts are the six components a job's cost is made of.
type JobCostParts struct {
	Materials  float64
	Install    float64
	Invention  float64
	Extras     float64
	BrokersFee float64
	// TransactionFee is the fee taken on each sale. `Transaction.Tax` keeps ESI's
	// own name for the same figure, which is where it is read from.
	TransactionFee float64
}

// Build is what it cost to make the item — invention included, because a job
// that had to invent its blueprint cost that too.
func (p JobCostParts) Build() float64 {
	return p.Materials + p.Install + p.Extras + p.Invention
}

// Total is what the job cost: building it, and then selling it.
func (p JobCostParts) Total() float64 {
	return p.Build() + p.BrokersFee + p.TransactionFee
}

// TotalInstallCost is what the installs cost: the sum of the ESI jobs linked to
// this job at the build stage.
//
// It is summed from the linked rows on every call, so linking and unlinking
// cannot leave the figure behind. Nothing linked costs nothing — setup estimates
// are a planning figure the SPA keeps to itself. Job.totalInstallCost() in the
// SPA is the same method.
func (j Job) TotalInstallCost() float64 {
	var installed float64
	for _, linked := range j.Build.Costs.LinkedJobs {
		installed += linked.Cost
	}
	return installed
}

// TotalQuantityProduced is how many items the job produces: what its setups are
// set to make.
//
// It is worked out from the setups on every call, so a setup added, removed or
// resized is reflected immediately and nothing is stored that could fall behind
// them. Job.totalQuantityProduced() in the SPA is the same method.
func (j Job) TotalQuantityProduced() int {
	produced := 0
	for _, setup := range j.Build.Setup {
		produced += j.ItemsProducedPerRun * setup.RunCount * setup.JobCount
	}
	return produced
}

// TotalExtrasCost is what the extras cost: the sum of the rows the Extras panel
// keeps on the job.
//
// It is summed from the rows on every call, so adding, removing or editing one
// is reflected at once. Job.totalExtrasCost() in the SPA is the same method.
func (j Job) TotalExtrasCost() float64 {
	total := 0.0
	for _, extra := range j.Build.Costs.ExtrasCosts {
		total += extra.ExtraValue
	}
	return total
}

// TotalInventionCost is what invention cost: the sum of the entries recorded
// against the job.
//
// It is summed from the entries on every call, so adding, removing or editing
// one is reflected at once. Job.totalInventionCost() in the SPA is the same
// method.
func (j Job) TotalInventionCost() float64 {
	total := 0.0
	for _, entry := range j.Build.Costs.InventionEntries {
		total += entry.ItemCost
	}
	return total
}

// MaterialRequirement is how many of a material the job's setups call for.
//
// Summed from the setups on every call, so a setup added, removed or resized
// moves what each material needs with it. Job#materialRequirement in the SPA is
// the same method.
func (j Job) MaterialRequirement(typeID int) int {
	required := 0
	for _, setup := range j.Build.Setup {
		required += setup.MaterialQuantity(typeID)
	}
	return required
}

// TotalMaterialCost is what the materials cost the job: what each material's
// purchases bought, summed. Job.totalMaterialCost() in the SPA is the same
// method.
func (j Job) TotalMaterialCost() float64 {
	total := 0.0
	for _, material := range j.Build.Materials {
		total += material.PurchasedCost(j.MaterialRequirement(material.TypeID))
	}
	return total
}

// CostParts reads what the job cost from its own fields.
//
// Every component is summed from the rows that make it up: the purchases on each
// material, the linked ESI jobs, the extras rows and the invention entries.
func (j Job) CostParts() JobCostParts {
	parts := JobCostParts{
		Materials: j.TotalMaterialCost(),
		Install:   j.TotalInstallCost(),
		Invention: j.TotalInventionCost(),
		Extras:    j.TotalExtrasCost(),
	}
	for _, fee := range j.Build.Sale.BrokersFee {
		parts.BrokersFee += fee.Amount
	}
	for _, transaction := range j.Build.Sale.Transactions {
		parts.TransactionFee += transaction.Tax
	}
	return parts
}

// countedPurchases is what the job is charged for on a material, and how much of
// it that bought.
//
// The cheapest purchases fill the requirement first, so a job pays the best
// prices it managed and the dearest units are the ones left over. Nothing beyond
// the requirement adds cost. Material#quantityPurchased and
// Material#purchasedCost in the SPA are the same figures.
func (m JobMaterial) countedPurchases(requirement int) (int, float64) {
	rows := make([]Purchase, 0, len(m.Purchasing))
	for _, row := range m.Purchasing {
		if row.ItemCount >= 0 && row.ItemCost >= 0 {
			rows = append(rows, row)
		}
	}
	sort.SliceStable(rows, func(i, j int) bool { return rows[i].ItemCost < rows[j].ItemCost })

	quantity := 0
	cost := 0.0
	for _, row := range rows {
		take := min(row.ItemCount, max(0, requirement-quantity))
		if take <= 0 {
			continue
		}
		quantity += take
		cost += float64(take) * row.ItemCost
	}
	return quantity, cost
}

// QuantityPurchased is how many of the purchases count toward the requirement
// the job's setups call for.
func (m JobMaterial) QuantityPurchased(requirement int) int {
	quantity, _ := m.countedPurchases(requirement)
	return quantity
}

// PurchasedCost is what that counted quantity cost.
func (m JobMaterial) PurchasedCost(requirement int) float64 {
	_, cost := m.countedPurchases(requirement)
	return cost
}

// ExtraCost matches the SPA extras row (Extras panel, Job.toDocument): id, category, extraText, extraValue.
// Category is the extras category id as a string (same as ExtraCategory.ID). ExtraText is the description.
// ExtraValue is the ISK amount (numeric JSON/BSON). UnmarshalJSON/UnmarshalBSON coerce legacy scalars (numeric category,
// type/label/cost aliases) in addition to archiveimport.normalizeExtrasCosts for Firestore import.
type ExtraCost struct {
	ID         string  `json:"id" bson:"id"`
	Category   string  `json:"category" bson:"category"`
	ExtraText  string  `json:"extraText" bson:"extraText"`
	ExtraValue float64 `json:"extraValue" bson:"extraValue"` // ISK amount
}

func isJSONNullOrEmpty(raw json.RawMessage) bool {
	b := bytes.TrimSpace(raw)
	return len(b) == 0 || string(b) == "null"
}

func extraCostScalarString(raw json.RawMessage) string {
	raw = bytes.TrimSpace(raw)
	if len(raw) == 0 || string(raw) == "null" {
		return ""
	}
	var s string
	if err := json.Unmarshal(raw, &s); err == nil {
		return strings.TrimSpace(s)
	}
	var f float64
	if err := json.Unmarshal(raw, &f); err == nil {
		return strings.TrimSpace(strconv.FormatFloat(f, 'f', -1, 64))
	}
	var n json.Number
	if err := json.Unmarshal(raw, &n); err == nil {
		f, err := n.Float64()
		if err != nil {
			return ""
		}
		return strings.TrimSpace(strconv.FormatFloat(f, 'f', -1, 64))
	}
	return strings.TrimSpace(string(raw))
}

func extraCostScalarFloat64(raw json.RawMessage) float64 {
	raw = bytes.TrimSpace(raw)
	if len(raw) == 0 || string(raw) == "null" {
		return 0
	}
	var f float64
	if err := json.Unmarshal(raw, &f); err == nil {
		return f
	}
	var s string
	if err := json.Unmarshal(raw, &s); err == nil {
		s = strings.TrimSpace(s)
		if s == "" {
			return 0
		}
		v, err := strconv.ParseFloat(s, 64)
		if err != nil {
			return 0
		}
		return v
	}
	var n json.Number
	if err := json.Unmarshal(raw, &n); err == nil {
		f, _ := n.Float64()
		return f
	}
	return 0
}

// UnmarshalJSON accepts legacy numeric category, type→category, label→extraText, cost→extraValue, and string extraValue.
func (e *ExtraCost) UnmarshalJSON(data []byte) error {
	var m map[string]json.RawMessage
	if err := json.Unmarshal(data, &m); err != nil {
		return err
	}
	if raw, ok := m["id"]; ok {
		e.ID = extraCostScalarString(raw)
	}
	catRaw, catOK := m["category"]
	if !catOK || isJSONNullOrEmpty(catRaw) {
		catRaw = m["type"]
	}
	e.Category = extraCostScalarString(catRaw)
	txtRaw, txtOK := m["extraText"]
	if !txtOK || isJSONNullOrEmpty(txtRaw) {
		txtRaw = m["label"]
	}
	e.ExtraText = extraCostScalarString(txtRaw)
	valRaw, ok := m["extraValue"]
	if !ok || isJSONNullOrEmpty(valRaw) {
		valRaw = m["cost"]
	}
	e.ExtraValue = extraCostScalarFloat64(valRaw)
	return nil
}

func extraCostCategoryFromBSON(v any) string {
	if v == nil {
		return ""
	}
	switch x := v.(type) {
	case string:
		return strings.TrimSpace(x)
	case int32:
		return strconv.FormatInt(int64(x), 10)
	case int64:
		return strconv.FormatInt(x, 10)
	case int:
		return strconv.Itoa(x)
	case float64:
		return strings.TrimSpace(strconv.FormatFloat(x, 'f', -1, 64))
	case float32:
		return strings.TrimSpace(strconv.FormatFloat(float64(x), 'f', -1, 64))
	default:
		return strings.TrimSpace(fmt.Sprint(x))
	}
}

func extraCostValueFromBSON(v any) float64 {
	if v == nil {
		return 0
	}
	switch x := v.(type) {
	case float64:
		return x
	case float32:
		return float64(x)
	case int32:
		return float64(x)
	case int64:
		return float64(x)
	case int:
		return float64(x)
	case string:
		s := strings.TrimSpace(x)
		if s == "" {
			return 0
		}
		f, err := strconv.ParseFloat(s, 64)
		if err != nil {
			return 0
		}
		return f
	default:
		return 0
	}
}

// UnmarshalBSON coerces legacy numeric category and type/label/cost aliases like UnmarshalJSON.
func (e *ExtraCost) UnmarshalBSON(data []byte) error {
	var m bson.M
	if err := bson.Unmarshal(data, &m); err != nil {
		return err
	}
	if v, ok := m["id"]; ok && v != nil {
		e.ID = extraCostCategoryFromBSON(v)
	}
	cat, ok := m["category"]
	if !ok || cat == nil {
		cat = m["type"]
	}
	e.Category = extraCostCategoryFromBSON(cat)
	txt, ok := m["extraText"]
	if !ok || txt == nil {
		txt = m["label"]
	}
	e.ExtraText = extraCostCategoryFromBSON(txt)
	val, ok := m["extraValue"]
	if !ok || val == nil {
		val = m["cost"]
	}
	e.ExtraValue = extraCostValueFromBSON(val)
	return nil
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
	CorporationID   int     `json:"corporation_id,omitempty" bson:"corporation_id,omitempty"` // client-facing; converted to CorporationRef before write
	CorporationRef  string  `json:"-" bson:"corporation_ref,omitempty"`
	CharacterID     int     `json:"character_id,omitempty" bson:"-"` // client-facing only
	CharacterRef    string  `json:"-" bson:"character_ref,omitempty"`
	JobType         int     `json:"job_type" bson:"job_type"` // Job type
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
	MarketOrders []MarketOrder `json:"marketOrders" bson:"marketOrders"`
	Transactions []Transaction `json:"transactions" bson:"transactions"`
	BrokersFee   []BrokerFee   `json:"brokersFee" bson:"brokersFee"`
}

// MarketOrder represents a market order for selling products
// Matches the structure created by createESIMarketOrder in createMarketOrder.js
type MarketOrder struct {
	Duration       int      `json:"duration" bson:"duration"`                               // Order duration in days
	IsCorporation  bool     `json:"is_corporation" bson:"is_corporation"`                   // Whether this is a corporation order
	Issued         string   `json:"issued" bson:"issued"`                                   // Order issue timestamp
	LocationID     int      `json:"location_id" bson:"location_id"`                         // Location ID where order is placed
	OrderID        int      `json:"order_id" bson:"order_id"`                               // Unique order ID
	ItemPrice      float64  `json:"item_price" bson:"item_price"`                           // Order price per unit
	Range          string   `json:"range" bson:"range"`                                     // ESI string (e.g. "region"); legacy non-strings normalized in archiveimport
	RegionID       int      `json:"region_id" bson:"region_id"`                             // Region ID where order is placed
	TypeID         int      `json:"type_id" bson:"type_id"`                                 // Item type ID
	VolumeRemain   int      `json:"volume_remain" bson:"volume_remain"`                     // Remaining volume
	VolumeTotal    int      `json:"volume_total" bson:"volume_total"`                       // Total volume
	TimeStamps     []string `json:"timeStamps" bson:"timeStamps"`                           // Array of timestamp history
	CharacterHash  string   `json:"CharacterHash,omitempty" bson:"CharacterHash,omitempty"` // Character hash for identification
	CorporationID  int      `json:"corporation_id,omitempty" bson:"-"`                      // client-facing only
	CorporationRef string   `json:"-" bson:"corporation_ref,omitempty"`
	CharacterID    int      `json:"character_id,omitempty" bson:"-"` // client-facing only
	CharacterRef   string   `json:"-" bson:"character_ref,omitempty"`
	Complete       bool     `json:"complete" bson:"complete"` // Whether order is complete
	State          string   `json:"state" bson:"state"`       // Order state (active, etc.)
}

// Transaction represents a completed market transaction
// Matches the structure created by createTransaction in createTransaction.js
type Transaction struct {
	OrderID        int     `json:"order_id,omitempty" bson:"order_id,omitempty"`           // zero = none; legacy null/string/float normalized in archiveimport
	JournalRefID   int64   `json:"journal_ref_id" bson:"journal_ref_id"`                   // Journal reference ID
	UnitPrice      float64 `json:"unit_price" bson:"unit_price"`                           // Price per unit
	Amount         float64 `json:"amount" bson:"amount"`                                   // Transaction amount
	Tax            float64 `json:"tax" bson:"tax"`                                         // Tax amount
	TransactionID  int64   `json:"transaction_id" bson:"transaction_id"`                   // ESI id; string/float historic imports normalized in archiveimport
	Quantity       int     `json:"quantity" bson:"quantity"`                               // Quantity of items
	Date           string  `json:"date" bson:"date"`                                       // Transaction date
	LocationID     int     `json:"location_id" bson:"location_id"`                         // Location ID
	IsCorp         bool    `json:"is_corp" bson:"is_corp"`                                 // Whether it's a corporation transaction
	TypeID         int     `json:"type_id" bson:"type_id"`                                 // Item type ID
	Description    string  `json:"description" bson:"description"`                         // Transaction description
	CharacterHash  string  `json:"CharacterHash,omitempty" bson:"CharacterHash,omitempty"` // Character hash for identification
	CorporationID  int     `json:"corporation_id,omitempty" bson:"-"`                      // client-facing only
	CorporationRef string  `json:"-" bson:"corporation_ref,omitempty"`
	CharacterID    int     `json:"character_id,omitempty" bson:"-"` // client-facing only
	CharacterRef   string  `json:"-" bson:"character_ref,omitempty"`
}

// BrokerFee represents broker fees for market orders
// Matches the structure created by ESIBrokerFee in findBrokersFeeEntry.js
type BrokerFee struct {
	OrderID        int     `json:"order_id" bson:"order_id"`                               // Order ID associated with the fee
	ID             int64   `json:"id" bson:"id"`                                           // Journal entry ID
	Complete       bool    `json:"complete" bson:"complete"`                               // Whether the fee is complete
	Date           string  `json:"date" bson:"date"`                                       // Fee date
	Amount         float64 `json:"amount" bson:"amount"`                                   // Fee amount
	CharacterHash  string  `json:"CharacterHash,omitempty" bson:"CharacterHash,omitempty"` // Character hash for identification
	CorporationID  int     `json:"corporation_id,omitempty" bson:"-"`                      // client-facing only
	CorporationRef string  `json:"-" bson:"corporation_ref,omitempty"`
	CharacterID    int     `json:"character_id,omitempty" bson:"-"` // client-facing only
	CharacterRef   string  `json:"-" bson:"character_ref,omitempty"`
}

// JobMaterial represents a material required for the job
type JobMaterial struct {
	TypeID     int        `json:"typeID" bson:"typeID"`
	Name       string     `json:"name" bson:"name"`
	JobType    int        `json:"jobType" bson:"jobType"`
	Volume     float64    `json:"volume" bson:"volume"` // coerced on historic import
	Purchasing []Purchase `json:"purchasing" bson:"purchasing"`
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
	// RetainedStockBuild marks output the user keeps rather than sells, so the
	// statistics pipeline counts it as retained rather than as an unsold shortfall.
	RetainedStockBuild bool      `json:"retainedStockBuild,omitempty" bson:"retainedStockBuild,omitempty"`
	DeletedAt          time.Time `json:"deletedAt,omitzero" bson:"deletedAt,omitzero"`
	DeletedBy          string    `json:"deletedBy,omitempty" bson:"deletedBy,omitempty"`
}
