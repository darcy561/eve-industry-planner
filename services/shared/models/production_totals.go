package models

// BuildMeasures is the set of totals every build-scoped aggregate carries. Embed
// it rather than restating the fields, so a new measure lands in one place.
type BuildMeasures struct {
	TotalJobs           int64   `bson:"totalJobs" json:"totalJobs"`
	ItemBuildCount      float64 `bson:"itemBuildCount" json:"itemBuildCount"`
	BuildCostTotal      float64 `bson:"buildCostTotal" json:"buildCostTotal"`
	BrokersFeeTotal     float64 `bson:"brokersFeeTotal" json:"brokersFeeTotal"`
	TransactionFeeTotal float64 `bson:"transactionFeeTotal" json:"transactionFeeTotal"`
	JobCostTotal        float64 `bson:"jobCostTotal" json:"jobCostTotal"`
	SalesTotal          float64 `bson:"salesTotal" json:"salesTotal"`
	// ProfitLoss is salesTotal − brokersFeeTotal − transactionFeeTotal − jobCostTotal.
	ProfitLoss float64 `bson:"profitLoss" json:"profitLoss"`
}

// Plus returns m with src added field by field.
func (m BuildMeasures) Plus(src BuildMeasures) BuildMeasures {
	m.TotalJobs += src.TotalJobs
	m.ItemBuildCount += src.ItemBuildCount
	m.BuildCostTotal += src.BuildCostTotal
	m.BrokersFeeTotal += src.BrokersFeeTotal
	m.TransactionFeeTotal += src.TransactionFeeTotal
	m.JobCostTotal += src.JobCostTotal
	m.SalesTotal += src.SalesTotal
	m.ProfitLoss += src.ProfitLoss
	return m
}

// Segment names, matching the breakdown field each job is credited to. A view
// labelling a job and the document counting it read the same values from here
// rather than restating them as literals.
const (
	ArchiveSegmentProductionChain        = "productionChain"
	ArchiveSegmentRetainedStock          = "retainedStock"
	ArchiveSegmentStandaloneRecordedSale = "standaloneRecordedSale"
)

// ArchiveSegmentTotals is one Blueprint Archive segment: a production chain,
// retained stock, or a standalone recorded sale.
type ArchiveSegmentTotals struct {
	BuildMeasures     `bson:",inline"`
	TotalSoldQuantity float64 `bson:"totalSoldQuantity,omitempty" json:"totalSoldQuantity,omitempty"`
}

func (s ArchiveSegmentTotals) Plus(src ArchiveSegmentTotals) ArchiveSegmentTotals {
	s.BuildMeasures = s.BuildMeasures.Plus(src.BuildMeasures)
	s.TotalSoldQuantity += src.TotalSoldQuantity
	return s
}

// ProductionTotalsBreakdown splits a row's totals across the archive segments.
type ProductionTotalsBreakdown struct {
	ProductionChain        ArchiveSegmentTotals `bson:"productionChain" json:"productionChain"`
	RetainedStock          ArchiveSegmentTotals `bson:"retainedStock" json:"retainedStock"`
	StandaloneRecordedSale ArchiveSegmentTotals `bson:"standaloneRecordedSale" json:"standaloneRecordedSale"`
}

func (b ProductionTotalsBreakdown) Plus(src ProductionTotalsBreakdown) ProductionTotalsBreakdown {
	b.ProductionChain = b.ProductionChain.Plus(src.ProductionChain)
	b.RetainedStock = b.RetainedStock.Plus(src.RetainedStock)
	b.StandaloneRecordedSale = b.StandaloneRecordedSale.Plus(src.StandaloneRecordedSale)
	return b
}

// ProductionTotalsRow is one document in account_production_totals, keyed by account and item type.
type ProductionTotalsRow struct {
	ID string `bson:"_id" json:"-"`
	// AccountID scopes the document. The account is also the leading segment of
	// the _id, but a field lets a rebuild prune an account's totals with an
	// indexed match instead of a prefix scan over every account's documents.
	AccountID     string `bson:"accountID" json:"-"`
	JobType       int    `bson:"jobType" json:"jobType"`
	TypeID        int    `bson:"typeID" json:"typeID"`
	BuildMeasures `bson:",inline"`
	Breakdown     ProductionTotalsBreakdown `bson:"breakdown" json:"breakdown"`
	DataSnapshots []BuildStatSnapshot       `bson:"dataSnapshots" json:"dataSnapshots"`
}

// Plus sums src into r. JobType is taken from the first non-zero value.
func (r ProductionTotalsRow) Plus(src ProductionTotalsRow) ProductionTotalsRow {
	if r.JobType == 0 && src.JobType != 0 {
		r.JobType = src.JobType
	}
	r.BuildMeasures = r.BuildMeasures.Plus(src.BuildMeasures)
	r.Breakdown = r.Breakdown.Plus(src.Breakdown)
	return r
}

// BuildStatSnapshot is one archived job's contribution, stored in the totals
// document's dataSnapshots array.
type BuildStatSnapshot struct {
	TypeID              int     `json:"typeID" bson:"typeID"`
	JobID               string  `json:"jobID" bson:"jobID"`
	JobType             int     `json:"jobType" bson:"jobType"`
	ProcessDate         int64   `json:"processDate" bson:"processDate"` // Unix ms, like Date.now() in JS
	TotalProduced       float64 `json:"totalProduced" bson:"totalProduced"`
	TotalMaterialCost   float64 `json:"totalMaterialCost" bson:"totalMaterialCost"`
	MaterialCostPerItem float64 `json:"materialCostPerItem" bson:"materialCostPerItem"`
	TotalInventionCost  float64 `json:"totalInventionCost" bson:"totalInventionCost"`
	TotalInstallCost    float64 `json:"totalInstallCost" bson:"totalInstallCost"`
	TotalExtras         float64 `json:"totalExtras" bson:"totalExtras"`
	BrokersFeeTotal     float64 `json:"brokersFeeTotal" bson:"brokersFeeTotal"`
	TransactionFeeTotal float64 `json:"transactionFeeTotal" bson:"transactionFeeTotal"`
	TotalJobCost        float64 `json:"totalJobCost" bson:"totalJobCost"`
	TotalCostPerItem    float64 `json:"totalCostPerItem" bson:"totalCostPerItem"`
	TotalSales          float64 `json:"totalSales" bson:"totalSales"`
	AverageSalePrice    float64 `json:"averageSalePrice" bson:"averageSalePrice"`
	ProfitLoss          float64 `json:"profitLoss" bson:"profitLoss"`
}
