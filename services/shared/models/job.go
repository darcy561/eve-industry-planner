package models

import (
	"bytes"
	"encoding/json"
	"encoding/json/jsontext"
	"eve-industry-planner/shared/jsoncodec"
	"fmt"
	"slices"
	"sort"
	"strconv"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// Job is one industry job, shared by every service that reads one.
//
// What the job costs, produces and has linked is derived from the rows it holds
// rather than stored beside them, so a figure cannot fall behind an edit — the
// methods below are the only way to ask.

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
	ParentJobs          []string         `json:"parentJobs" bson:"parentJobs"`
	BlueprintTypeID     *int             `json:"blueprintTypeID" bson:"blueprintTypeID"`
	GroupID             string           `json:"groupID" bson:"groupID"` // empty string when not in a group
	IsReadyToSell       bool             `json:"isReadyToSell" bson:"isReadyToSell"`
	Build               JobBuild         `json:"build" bson:"build"`
	ESI                 JobESI           `json:"esi" bson:"esi"`
	RawData             RawData          `json:"rawData" bson:"rawData"`
	Skills              map[string]Skill `json:"skills" bson:"skills"`
	ItemsProducedPerRun int              `json:"itemsProducedPerRun" bson:"itemsProducedPerRun"`
	Layout              JobLayout        `json:"layout" bson:"layout"`
	Protected           *FieldProtection `json:"-" bson:"protected,omitempty"`
	// FiledCostMonth and FiledSalesMonth are the months a user filed the job's
	// two sides under, overriding what the reduction would derive. They live here
	// rather than on the statistics row because the row is rebuilt from this
	// document: on the job they are input to the reduction and survive every
	// rebuild, restore and re-archive.
	//
	// The sales side may only be filed when no line came from the market — see
	// SalesAreFromMarket.
	FiledCostMonth  *CalendarMonth `json:"filedCostMonth,omitempty" bson:"filedCostMonth,omitempty"`
	FiledSalesMonth *CalendarMonth `json:"filedSalesMonth,omitempty" bson:"filedSalesMonth,omitempty"`
	MetaData        JobMetaData    `json:"_meta" bson:"_meta"`
}

// IsMarketTransactionID reports whether a transaction id is one ESI issued.
//
// A sale entered by hand is minted with a negative id, so a positive one is the
// market's own. Money that arrived through the market arrived when it arrived,
// which is what the two being told apart decides.
func IsMarketTransactionID(id int64) bool {
	return id > 0
}

// SalesAreFromMarket reports whether ESI recorded any of this job's sales.
func (j Job) SalesAreFromMarket() bool {
	for _, transaction := range j.ESI.Transactions {
		if IsMarketTransactionID(transaction.TransactionID) {
			return true
		}
	}
	return false
}

// FilesItsOwnMonths reports whether any month on this job was chosen rather than
// derived, which a reader has to be told.
func (j Job) FilesItsOwnMonths() bool {
	return j.FiledCostMonth.Valid() || j.FiledSalesMonth.Valid()
}

// JobBuild is what the user planned for this job: how it is set up, what it is
// built from, the costs they entered by hand and where they mean to sell it.
// What the world reported back is in [JobESI].
type JobBuild struct {
	Setup     map[string]JobSetup    `json:"setup" bson:"setup"`
	Materials map[string]JobMaterial `json:"materials" bson:"materials"`
	ChildJobs map[string][]string    `json:"childJobs" bson:"childJobs"`
	// ExtrasCosts and InventionEntries are each keyed by their row's own id.
	ExtrasCosts      map[string]ExtraCost      `json:"extrasCosts" bson:"extrasCosts"`
	InventionEntries map[string]InventionEntry `json:"inventionEntries" bson:"inventionEntries"`
	// Where the player means to sell, as against [JobESI] which is where it went.
	SellerCharacter *string `json:"sellerCharacter,omitempty" bson:"sellerCharacter,omitempty"`
	SaleLocationID  *string `json:"saleLocationID,omitempty" bson:"saleLocationID,omitempty"`
	// LocalPricing is this job's own choice of where each side of it is priced,
	// standing in for the account's defaults. Nil on a job that has not chosen,
	// which is most of them.
	LocalPricing *JobPricing `json:"localPricing,omitempty" bson:"localPricing,omitempty"`
	// MaterialPriceOverrides is keyed by material type id. An entry names the
	// market or order type that one material is priced from, standing in for the
	// job's own choice above.
	MaterialPriceOverrides map[string]MaterialPriceOverride `json:"materialPriceOverrides,omitempty" bson:"materialPriceOverrides,omitempty"`
}

// JobSetup represents a single setup configuration for a job
type JobSetup struct {
	ID                             string                   `json:"id" bson:"id"`
	RunCount                       int                      `json:"runCount" bson:"runCount"`
	JobCount                       int                      `json:"jobCount" bson:"jobCount"`
	ME                             int                      `json:"ME" bson:"ME"`
	TE                             int                      `json:"TE" bson:"TE"`
	StructureID                    int                      `json:"structureID" bson:"structureID"`
	RigSlot1                       int                      `json:"rigSlot1" bson:"rigSlot1"`
	RigSlot2                       int                      `json:"rigSlot2" bson:"rigSlot2"`
	SystemTypeID                   int                      `json:"systemTypeID" bson:"systemTypeID"`
	SystemID                       int                      `json:"systemID" bson:"systemID"`
	TaxValue                       float64                  `json:"taxValue" bson:"taxValue"`
	CustomStructureID              string                   `json:"customStructureID" bson:"customStructureID"`
	SelectedCharacter              string                   `json:"selectedCharacter" bson:"selectedCharacter"`
	MaterialCount                  map[string]MaterialCount `json:"materialCount" bson:"materialCount"`
	RawTime                        float64                  `json:"rawTime" bson:"rawTime"`
	JobType                        int                      `json:"jobType" bson:"jobType"`
	AppliedRequirementID           int64                    `json:"appliedRequirementID" bson:"appliedRequirementID"`
	AlternativeSystemIndexValue    float64                  `json:"alternativeSystemIndexValue" bson:"alternativeSystemIndexValue"`
	UseAlternativeSystemIndexValue bool                     `json:"useAlternativeSystemIndexValue" bson:"useAlternativeSystemIndexValue"`
}

// MaterialQuantity is how many of a material this setup calls for.
func (s JobSetup) MaterialQuantity(typeID int) int {
	return s.MaterialCount[strconv.Itoa(typeID)].Quantity
}

// MaterialCount represents material quantity tracking in a setup (whole units only).
type MaterialCount struct {
	TypeID      int `json:"typeID" bson:"typeID"`
	Quantity    int `json:"quantity" bson:"quantity"`
	RawQuantity int `json:"rawQuantity" bson:"rawQuantity"`
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
// Nothing linked costs nothing: setup estimates are a planning figure the SPA
// keeps to itself.
func (j Job) TotalInstallCost() float64 {
	var installed float64
	for _, linked := range j.ESI.LinkedJobs {
		installed += linked.Cost
	}
	return installed
}

// TotalQuantityProduced is how many items the job produces: what its setups are
// set to make.
func (j Job) TotalQuantityProduced() int {
	produced := 0
	for _, setup := range j.Build.Setup {
		produced += j.ItemsProducedPerRun * setup.RunCount * setup.JobCount
	}
	return produced
}

// TotalExtrasCost is what the extras cost: the sum of the rows the Extras panel
// keeps on the job.
func (j Job) TotalExtrasCost() float64 {
	total := 0.0
	for _, extra := range j.Build.ExtrasCosts {
		total += extra.ExtraValue
	}
	return total
}

// TotalInventionCost is what invention cost: the sum of the entries recorded
// against the job.
func (j Job) TotalInventionCost() float64 {
	total := 0.0
	for _, entry := range j.Build.InventionEntries {
		total += entry.ItemCost
	}
	return total
}

// LinkedESIJobIDs is the ESI industry jobs linked to this job.
//
// Sorted rather than ranged: the rows come out of a map, and these ids are
// compared and stored on the group shape, so an unordered list would read as a
// change on every rebuild.
func (j Job) LinkedESIJobIDs() []int64 {
	out := make([]int64, 0, len(j.ESI.LinkedJobs))
	for _, linked := range j.ESI.LinkedJobs {
		out = append(out, int64(linked.JobID))
	}
	slices.Sort(out)
	return out
}

// IsComplete reports whether everything the order listed has sold.
//
// Read from the volume left rather than stored beside it, so an order cannot
// claim to be finished while it still holds volume.
func (o MarketOrder) IsComplete() bool {
	return o.VolumeTotal > 0 && o.VolumeRemain <= 0
}

// LinkedOrderIDs is the ESI market orders linked to this job. Sorted, for the
// reason LinkedESIJobIDs gives.
func (j Job) LinkedOrderIDs() []int64 {
	out := make([]int64, 0, len(j.ESI.MarketOrders))
	for _, order := range j.ESI.MarketOrders {
		out = append(out, int64(order.OrderID))
	}
	slices.Sort(out)
	return out
}

// LinkedTransactionIDs is the ESI transactions linked to this job. Sorted, for
// the reason LinkedESIJobIDs gives.
func (j Job) LinkedTransactionIDs() []int64 {
	out := make([]int64, 0, len(j.ESI.Transactions))
	for _, transaction := range j.ESI.Transactions {
		out = append(out, transaction.TransactionID)
	}
	slices.Sort(out)
	return out
}

// MaterialRequirement is how many of a material the job's setups call for.
func (j Job) MaterialRequirement(typeID int) int {
	required := 0
	for _, setup := range j.Build.Setup {
		required += setup.MaterialQuantity(typeID)
	}
	return required
}

// TotalMaterialCost is what the materials cost the job: what each material's
// purchases bought, summed.
func (j Job) TotalMaterialCost() float64 {
	total := 0.0
	for _, material := range j.Build.Materials {
		total += material.PurchasedCost(j.MaterialRequirement(material.TypeID))
	}
	return total
}

// CostParts is the six components of what the job cost.
func (j Job) CostParts() JobCostParts {
	parts := JobCostParts{
		Materials: j.TotalMaterialCost(),
		Install:   j.TotalInstallCost(),
		Invention: j.TotalInventionCost(),
		Extras:    j.TotalExtrasCost(),
	}
	for _, order := range j.ESI.MarketOrders {
		parts.BrokersFee += order.Fee
	}
	for _, transaction := range j.ESI.Transactions {
		parts.TransactionFee += transaction.Tax
	}
	return parts
}

// countedPurchases is what the job is charged for on a material, and how much of
// it that bought.
//
// The cheapest purchases fill the requirement first, so a job pays the best
// prices it managed and the dearest units are the ones left over. Nothing beyond
// the requirement adds cost.
func (m JobMaterial) countedPurchases(requirement int) (int, float64) {
	rows := make([]Purchase, 0, len(m.Purchasing))
	for _, row := range m.Purchasing {
		if row.ItemCount >= 0 && row.ItemCost >= 0 {
			rows = append(rows, row)
		}
	}
	// By id where the cost ties: the rows come out of a map, so their order is
	// randomised and a stable sort has nothing to be stable about. Equal-cost
	// rows contribute the same to either total whichever is taken first, so the
	// tiebreak is for a caller reading one purchase's share rather than for
	// these sums.
	sort.Slice(rows, func(i, j int) bool {
		if rows[i].ItemCost != rows[j].ItemCost {
			return rows[i].ItemCost < rows[j].ItemCost
		}
		return rows[i].ID < rows[j].ID
	})

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

// ExtraCost is one cost a player recorded against a job by hand.
//
// Category is an ExtraCategory.ID. The decoders below accept older shapes rows
// were written in — a numeric category, and type/label/cost field names — so a
// stored row keeps decoding whatever it was written as.
type ExtraCost struct {
	ID            string  `json:"id" bson:"id"`
	Category      string  `json:"category" bson:"category"`
	CategoryLabel string  `json:"categoryLabel" bson:"categoryLabel"`
	ExtraText     string  `json:"extraText" bson:"extraText"`
	ExtraValue    float64 `json:"extraValue" bson:"extraValue"` // ISK amount
}

// ExtrasCategoryUnassigned is the category an extra cost carries when the user
// filed it under none. It is a real row in DefaultExtrasCategories, not a
// sentinel, so a reader resolves it to a name like any other.
const ExtrasCategoryUnassigned = "0"

// ExtrasCategoryOrUnassigned settles a stored category id.
//
// Rows exist carrying "" for unfiled, which names no category the account lists
// and so can never be given a label. Every reader has to agree on one value or
// the same cost counts twice; this is where that is decided.
func ExtrasCategoryOrUnassigned(category string) string {
	if strings.TrimSpace(category) == "" {
		return ExtrasCategoryUnassigned
	}
	return category
}

func isJSONNullOrEmpty(raw jsontext.Value) bool {
	b := bytes.TrimSpace(raw)
	return len(b) == 0 || string(b) == "null"
}

func extraCostScalarString(raw jsontext.Value) string {
	raw = bytes.TrimSpace(raw)
	if len(raw) == 0 || string(raw) == "null" {
		return ""
	}
	var s string
	if err := jsoncodec.Unmarshal(raw, &s); err == nil {
		return strings.TrimSpace(s)
	}
	var f float64
	if err := jsoncodec.Unmarshal(raw, &f); err == nil {
		return strings.TrimSpace(strconv.FormatFloat(f, 'f', -1, 64))
	}
	var n json.Number
	if err := jsoncodec.Unmarshal(raw, &n); err == nil {
		f, err := n.Float64()
		if err != nil {
			return ""
		}
		return strings.TrimSpace(strconv.FormatFloat(f, 'f', -1, 64))
	}
	return strings.TrimSpace(string(raw))
}

func extraCostScalarFloat64(raw jsontext.Value) float64 {
	raw = bytes.TrimSpace(raw)
	if len(raw) == 0 || string(raw) == "null" {
		return 0
	}
	var f float64
	if err := jsoncodec.Unmarshal(raw, &f); err == nil {
		return f
	}
	var s string
	if err := jsoncodec.Unmarshal(raw, &s); err == nil {
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
	if err := jsoncodec.Unmarshal(raw, &n); err == nil {
		f, _ := n.Float64()
		return f
	}
	return 0
}

// UnmarshalJSON decodes a row written in any shape ExtraCost has had.
//
// categoryLabel is read here rather than left to the struct tags: a decoder that
// misses it writes an empty label back over a stamped one, and the name a deleted
// category had is only recoverable from the row that carries it.
func (e *ExtraCost) UnmarshalJSON(data []byte) error {
	var m map[string]jsontext.Value
	if err := jsoncodec.Unmarshal(data, &m); err != nil {
		return err
	}
	if raw, ok := m["id"]; ok {
		e.ID = extraCostScalarString(raw)
	}
	catRaw, catOK := m["category"]
	if !catOK || isJSONNullOrEmpty(catRaw) {
		catRaw = m["type"]
	}
	e.Category = ExtrasCategoryOrUnassigned(extraCostScalarString(catRaw))
	e.CategoryLabel = extraCostScalarString(m["categoryLabel"])
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

// stringFromDocumentValue reads a stored value as a string whatever shape it was
// written in. Ids and categories have both been numbers in this collection's
// history, and a document written then still has to decode.
func stringFromDocumentValue(v any) string {
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

// UnmarshalBSON decodes a row written in any shape ExtraCost has had, as
// UnmarshalJSON does.
func (e *ExtraCost) UnmarshalBSON(data []byte) error {
	var m bson.M
	if err := bson.Unmarshal(data, &m); err != nil {
		return err
	}
	if v, ok := m["id"]; ok && v != nil {
		e.ID = stringFromDocumentValue(v)
	}
	cat, ok := m["category"]
	if !ok || cat == nil {
		cat = m["type"]
	}
	e.Category = ExtrasCategoryOrUnassigned(stringFromDocumentValue(cat))
	e.CategoryLabel = stringFromDocumentValue(m["categoryLabel"])
	txt, ok := m["extraText"]
	if !ok || txt == nil {
		txt = m["label"]
	}
	e.ExtraText = stringFromDocumentValue(txt)
	val, ok := m["extraValue"]
	if !ok || val == nil {
		val = m["cost"]
	}
	e.ExtraValue = extraCostValueFromBSON(val)
	return nil
}

// LinkedESIJob is an ESI industry job linked to a planner job.
type LinkedESIJob struct {
	Status          string  `json:"status" bson:"status"`                                     // Job status (active, completed, etc.)
	CharacterHash   string  `json:"CharacterHash,omitempty" bson:"CharacterHash,omitempty"`   // Character hash of the owner
	Runs            int     `json:"runs" bson:"runs"`                                         // Number of runs
	JobID           int     `json:"job_id" bson:"job_id"`                                     // ESI job ID
	CompletedDate   string  `json:"completed_date,omitempty" bson:"completed_date,omitempty"` // RFC3339-ish
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
	CorporationID   int     `json:"corporation_id,omitzero" bson:"corporation_id,omitempty"`  // client-facing; converted to CorporationRef before write
	CorporationRef  string  `json:"-" bson:"corporation_ref,omitempty"`
	CharacterID     int     `json:"character_id,omitzero" bson:"-"` // client-facing only
	CharacterRef    string  `json:"-" bson:"character_ref,omitempty"`
	JobType         int     `json:"job_type" bson:"job_type"` // Job type
}

// InventionEntrySchemaCurrent is the shape a row written today has.
//
// A version on the row rather than on the job, because entries of different
// vintages sit in one job: a row added after a shape change joins rows written
// before it, and the job's own schema version cannot tell them apart.
const InventionEntrySchemaCurrent = 1

// InventionEntry is one invention cost recorded against a job, keyed in
// [JobBuild.InventionEntries] by the ID it carries.
type InventionEntry struct {
	Version  int     `json:"version" bson:"version"`   // Which shape this row was written in
	ID       string  `json:"id" bson:"id"`             // Identifies the row within its job
	ItemName string  `json:"itemName" bson:"itemName"` // Name of the invention item
	ItemCost float64 `json:"itemCost" bson:"itemCost"` // Cost of the invention item
}

// UnmarshalBSON reads an id written in either shape.
//
// The id was minted from the clock and stored as a number until it became a
// uuid, so documents carry both. It is only ever compared, never parsed, and a
// number read as its own digits compares the same as it always did.
func (e *InventionEntry) UnmarshalBSON(data []byte) error {
	var m bson.M
	if err := bson.Unmarshal(data, &m); err != nil {
		return err
	}

	e.Version = inventionEntryVersion(m["version"])
	e.ID = stringFromDocumentValue(m["id"])
	e.ItemName = stringFromDocumentValue(m["itemName"])
	e.ItemCost = extraCostValueFromBSON(m["itemCost"])

	return nil
}

// inventionEntryVersion reads the version a row states, defaulting to the first.
// A row stored before the field existed is a v1 row: the field was added to
// name the shape those rows already had, not to change it.
func inventionEntryVersion(value any) int {
	if version := int(extraCostValueFromBSON(value)); version > 0 {
		return version
	}
	return 1
}

// UnmarshalJSON reads an id written in either shape, as UnmarshalBSON does.
func (e *InventionEntry) UnmarshalJSON(data []byte) error {
	var raw struct {
		Version  any     `json:"version"`
		ID       any     `json:"id"`
		ItemName string  `json:"itemName"`
		ItemCost float64 `json:"itemCost"`
	}
	if err := jsoncodec.Unmarshal(data, &raw); err != nil {
		return err
	}

	e.Version = inventionEntryVersion(raw.Version)
	e.ID = stringFromDocumentValue(raw.ID)
	e.ItemName = raw.ItemName
	e.ItemCost = raw.ItemCost

	return nil
}

// JobESI is what ESI observed about this job: the industry jobs it was built by,
// and the orders and sales it was sold through. [JobBuild] holds the other side
// — what the user planned — so a figure is read from whichever of the two
// actually knows it.
//
// Each collection is keyed by the id ESI itself assigns — job_id, order_id,
// transaction_id — so a row is found by the id it already carries rather than
// searched for.
type JobESI struct {
	LinkedJobs   map[string]LinkedESIJob `json:"industryJobs" bson:"industryJobs"`
	MarketOrders map[string]MarketOrder  `json:"marketOrders" bson:"marketOrders"`
	Transactions map[string]Transaction  `json:"transactions" bson:"transactions"`
}

// MarketOrder is an ESI market order linked to a job.
type MarketOrder struct {
	Duration       int      `json:"duration" bson:"duration"`                               // Order duration in days
	IsCorporation  bool     `json:"is_corporation" bson:"is_corporation"`                   // Whether this is a corporation order
	Issued         string   `json:"issued" bson:"issued"`                                   // Order issue timestamp
	LocationID     int      `json:"location_id" bson:"location_id"`                         // Location ID where order is placed
	OrderID        int      `json:"order_id" bson:"order_id"`                               // Unique order ID
	ItemPrice      float64  `json:"item_price" bson:"item_price"`                           // Order price per unit
	Range          string   `json:"range" bson:"range"`                                     // ESI string (e.g. "region")
	RegionID       int64    `json:"region_id" bson:"region_id"`                             // Region ID where order is placed
	TypeID         int      `json:"type_id" bson:"type_id"`                                 // Item type ID
	VolumeRemain   int      `json:"volume_remain" bson:"volume_remain"`                     // Remaining volume
	VolumeTotal    int      `json:"volume_total" bson:"volume_total"`                       // Total volume
	TimeStamps     []string `json:"timeStamps" bson:"timeStamps"`                           // Array of timestamp history
	CharacterHash  string   `json:"CharacterHash,omitempty" bson:"CharacterHash,omitempty"` // Character hash for identification
	CorporationID  int      `json:"corporation_id,omitzero" bson:"-"`                       // client-facing only
	CorporationRef string   `json:"-" bson:"corporation_ref,omitempty"`
	CharacterID    int      `json:"character_id,omitzero" bson:"-"` // client-facing only
	CharacterRef   string   `json:"-" bson:"character_ref,omitempty"`
	State          string   `json:"state" bson:"state"` // Order state (active, etc.)
	// Fee, SalesTax and FeeDate are the broker fee charged on this order. A fee
	// carries no identity of its own — the journal id it arrived with is shared
	// between orders listed together in one multi-sell — so it is a property of
	// the order it was charged against rather than a row beside it.
	Fee      float64 `json:"fee" bson:"fee"`
	SalesTax float64 `json:"salesTax" bson:"salesTax"`
	FeeDate  string  `json:"feeDate" bson:"feeDate"`
}

// Transaction is a completed sale linked to a job. Tax is what EVE charged on
// it, which is the figure a job's cost is built from.
type Transaction struct {
	OrderID        int     `json:"order_id,omitzero" bson:"order_id,omitempty"`            // zero = none
	JournalRefID   int64   `json:"journal_ref_id" bson:"journal_ref_id"`                   // Journal reference ID
	UnitPrice      float64 `json:"unit_price" bson:"unit_price"`                           // Price per unit
	Amount         float64 `json:"amount" bson:"amount"`                                   // Transaction amount
	Tax            float64 `json:"tax" bson:"tax"`                                         // Tax amount
	TransactionID  int64   `json:"transaction_id" bson:"transaction_id"`                   // ESI id
	Quantity       int     `json:"quantity" bson:"quantity"`                               // Quantity of items
	Date           string  `json:"date" bson:"date"`                                       // Transaction date
	LocationID     int     `json:"location_id" bson:"location_id"`                         // Location ID
	IsCorp         bool    `json:"is_corp" bson:"is_corp"`                                 // Whether it's a corporation transaction
	TypeID         int     `json:"type_id" bson:"type_id"`                                 // Item type ID
	Description    string  `json:"description" bson:"description"`                         // Transaction description
	CharacterHash  string  `json:"CharacterHash,omitempty" bson:"CharacterHash,omitempty"` // Character hash for identification
	CorporationID  int     `json:"corporation_id,omitzero" bson:"-"`                       // client-facing only
	CorporationRef string  `json:"-" bson:"corporation_ref,omitempty"`
	CharacterID    int     `json:"character_id,omitzero" bson:"-"` // client-facing only
	CharacterRef   string  `json:"-" bson:"character_ref,omitempty"`
}

// JobMaterial represents a material required for the job
// JobMaterial is one material the job is built from, keyed in
// [JobBuild.Materials] by the TypeID it carries. The field repeats the key so a
// row read on its own still says which material it is.
type JobMaterial struct {
	TypeID  int     `json:"typeID" bson:"typeID"`
	Name    string  `json:"name" bson:"name"`
	JobType int     `json:"jobType" bson:"jobType"`
	Volume  float64 `json:"volume" bson:"volume"` // coerced on historic import
	// Purchasing is keyed by each purchase's own id.
	Purchasing map[string]Purchase `json:"purchasing" bson:"purchasing"`
}

// Purchase is one buy recorded against a material. Which material it bought is
// the material it sits under, so the row states no type of its own.
type Purchase struct {
	ID             string  `json:"id" bson:"id"`                               // UUID identifier
	ChildID        string  `json:"childID,omitempty" bson:"childID,omitempty"` // Child job id; empty if none
	ChildJobImport bool    `json:"childJobImport" bson:"childJobImport"`       // Whether this purchase is imported from a child job
	ItemCount      int     `json:"itemCount" bson:"itemCount"`                 // Whole units only
	ItemCost       float64 `json:"itemCost" bson:"itemCost"`
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
// Skill is one skill building the job requires, keyed in [Job.Skills] by the
// TypeID it carries. The field repeats the key so a row read on its own still
// says which skill it is.
type Skill struct {
	TypeID int `json:"typeID" bson:"typeID"`
	Level  int `json:"level" bson:"level"`
}

// JobLayout is a job's own display choices. The `local*` fields are its
// departures from the account's defaults, which live on ApplicationSettings.
//
// Both decoders below assign every field by hand, so a field added here and
// nowhere else compiles, decodes to its zero value, and is written back empty by
// the next save.
type JobLayout struct {
	LocalMarketDisplay  string `json:"localMarketDisplay,omitempty" bson:"localMarketDisplay,omitempty"`
	LocalOrderDisplay   string `json:"localOrderDisplay,omitempty" bson:"localOrderDisplay,omitempty"`
	ESIJobTab           string `json:"esiJobTab,omitempty" bson:"esiJobTab,omitempty"`
	SetupToEdit         string `json:"setupToEdit,omitempty" bson:"setupToEdit,omitempty"`
	ResourceDisplayType string `json:"resourceDisplayType,omitempty" bson:"resourceDisplayType,omitempty"`
}

// MaterialPriceOverride is one material's departure from the job's market and
// order type. A side left empty falls back to the job's.
type MaterialPriceOverride struct {
	MarketDisplay string `json:"marketDisplay,omitempty" bson:"marketDisplay,omitempty"`
	OrderDisplay  string `json:"orderDisplay,omitempty" bson:"orderDisplay,omitempty"`
}

// UnmarshalBSON prefers the local* fields, falling back to the marketLocation
// and orderType keys some rows were written with.
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

// UnmarshalJSON prefers the local* fields, falling back to the marketLocation
// and orderType keys some rows were written with.
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
	if err := jsoncodec.Unmarshal(data, &aux); err != nil {
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

// JobMetaData is a job's ownership and lifecycle, kept apart from the job itself
// under `_meta` so a field about who holds a job is never mistaken for one about
// what the job is.
type JobMetaData struct {
	MetaData         `json:",inline" bson:",inline"`
	CreatedAt        time.Time `json:"createdAt" bson:"createdAt"`
	LastUpdatedBy    string    `json:"lastUpdatedBy" bson:"lastUpdatedBy"`
	ArchivedAt       time.Time `json:"archivedAt,omitzero" bson:"archivedAt,omitempty"`
	ArchivedBy       string    `json:"archivedBy,omitempty" bson:"archivedBy,omitempty"`
	ArchiveProcessed bool      `json:"archiveProcessed,omitzero" bson:"archiveProcessed,omitempty"`
	DeletedAt        time.Time `json:"deletedAt,omitzero" bson:"deletedAt,omitempty"`
	DeletedBy        string    `json:"deletedBy,omitempty" bson:"deletedBy,omitempty"`
}
