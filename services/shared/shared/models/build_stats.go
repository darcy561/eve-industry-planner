package models

// BuildStatsSegmentTotals is one Blueprint Archive segment (production-chain, retained stock, or standalone sales).
type BuildStatsSegmentTotals struct {
	TotalJobs           int64   `bson:"totalJobs" json:"totalJobs"`
	ItemBuildCount      float64 `bson:"itemBuildCount" json:"itemBuildCount"`
	BuildCostTotal      float64 `bson:"buildCostTotal" json:"buildCostTotal"`
	TotalSoldQuantity   float64 `bson:"totalSoldQuantity,omitempty" json:"totalSoldQuantity,omitempty"`
	BrokersFeeTotal     float64 `bson:"brokersFeeTotal" json:"brokersFeeTotal"`
	TransactionFeeTotal float64 `bson:"transactionFeeTotal" json:"transactionFeeTotal"`
	JobCostTotal        float64 `bson:"jobCostTotal" json:"jobCostTotal"`
	SalesTotal          float64 `bson:"salesTotal" json:"salesTotal"`
	// Net margin: salesTotal − brokers − transaction fees − jobCostTotal (rebuild workers).
	ProfitLoss float64 `bson:"profitLoss" json:"profitLoss"`
}

// BuildStatsBreakdown mirrors archived-job segment rolls written by ProcessDirtyAccountBuildStats.
type BuildStatsBreakdown struct {
	ProductionChain        BuildStatsSegmentTotals `bson:"productionChain" json:"productionChain"`
	RetainedStock          BuildStatsSegmentTotals `bson:"retainedStock" json:"retainedStock"`
	StandaloneRecordedSale BuildStatsSegmentTotals `bson:"standaloneRecordedSale" json:"standaloneRecordedSale"`
}

// BuildStatsRow is one document in MongoDB build_stats (aggregates from ProcessDirtyAccountBuildStats;
// same field names as legacy Firestore Users/{uid}/BuildStats/{typeID}).
type BuildStatsRow struct {
	ID                  string  `bson:"_id" json:"-"`
	JobType             int     `bson:"jobType" json:"jobType"`
	TypeID              int     `bson:"typeID" json:"typeID"`
	TotalJobs           int64   `bson:"totalJobs" json:"totalJobs"`
	ItemBuildCount      float64 `bson:"itemBuildCount" json:"itemBuildCount"`
	BuildCostTotal      float64 `bson:"buildCostTotal" json:"buildCostTotal"`
	BrokersFeeTotal     float64 `bson:"brokersFeeTotal" json:"brokersFeeTotal"`
	TransactionFeeTotal float64 `bson:"transactionFeeTotal" json:"transactionFeeTotal"`
	JobCostTotal        float64 `bson:"jobCostTotal" json:"jobCostTotal"`
	SalesTotal          float64 `bson:"salesTotal" json:"salesTotal"`
	// Same net formula as BuildStatsSegmentTotals (account rebuild).
	ProfitLoss float64             `bson:"profitLoss" json:"profitLoss"`
	Breakdown  BuildStatsBreakdown `bson:"breakdown,omitempty" json:"breakdown,omitempty"`
}

type BuildStatsTimelineBucket struct {
	Year                int     `json:"year"`
	Month               int     `json:"month"`
	TransactionCount    int64   `json:"transactionCount"`
	QuantitySold        float64 `json:"quantitySold"`
	SalesTotal          float64 `json:"salesTotal"`
	TransactionFeeTotal float64 `json:"transactionFeeTotal"`
	BrokersFeeTotal     float64 `json:"brokersFeeTotal"`
	ProfitLoss          float64 `json:"profitLoss"`
}

// BuildStatsRollupTotals sums transaction and fee lines for a period (aligned with BuildStatsTimelineBucket fields, without calendar keys).
type BuildStatsRollupTotals struct {
	TransactionCount    int64              `json:"transactionCount"`
	QuantitySold        float64            `json:"quantitySold"`
	SalesTotal          float64            `json:"salesTotal"`
	JobCostTotal        float64            `json:"jobCostTotal"`
	ExtraCategoryTotals map[string]float64 `json:"extraCategoryTotals,omitempty"`
	TransactionFeeTotal float64            `json:"transactionFeeTotal"`
	BrokersFeeTotal     float64            `json:"brokersFeeTotal"`
	ProfitLoss          float64            `json:"profitLoss"`
}

// BuildStatsRollupByType is per blueprint/item type when rolling up all types.
type BuildStatsRollupByType struct {
	TypeID int `json:"typeID"`
	BuildStatsRollupTotals
}

// BuildStatsRollupPeriodMeta describes the resolved time window from query parameters.
type BuildStatsRollupPeriodMeta struct {
	Kind      string `json:"kind"` // month|year|range|years
	Year      int    `json:"year,omitempty"`
	Month     int    `json:"month,omitempty"`
	FromYear  int    `json:"fromYear,omitempty"`
	FromMonth int    `json:"fromMonth,omitempty"`
	ToYear    int    `json:"toYear,omitempty"`
	ToMonth   int    `json:"toMonth,omitempty"`
	Years     []int  `json:"years,omitempty"`
}

// BuildStatsRollupResponse is GET .../rollup JSON (personal or corp scope).
type BuildStatsRollupResponse struct {
	Period BuildStatsRollupPeriodMeta `json:"period"`
	// TypeID is set when the client passed typeID=… (single-item query); ByType is omitted.
	TypeID *int                     `json:"typeID,omitempty"`
	Totals BuildStatsRollupTotals   `json:"totals"`
	ByType []BuildStatsRollupByType `json:"byType,omitempty"`
}

// CorpRollupOwnedLane marks corp-owned snapshot rows in corp_rollup_buckets (lane BSON field).
const CorpRollupOwnedLane = "~"

// UserRollupMonthlyBucket is a pre-aggregated calendar month for GET .../build-stats/rollup (personal).
// Built by ProcessDirtyAccountBuildStats from user_archived_job_stats (non-production-chain, non-revoked).
type UserRollupMonthlyBucket struct {
	ID                  string             `bson:"_id"`
	AccountID           string             `bson:"accountID"`
	TypeID              int                `bson:"typeID"`
	Year                int                `bson:"year"`
	Month               int                `bson:"month"`
	TransactionCount    int64              `bson:"transactionCount"`
	QuantitySold        float64            `bson:"quantitySold"`
	SalesTotal          float64            `bson:"salesTotal"`
	JobCostTotal        float64            `bson:"jobCostTotal"`
	ExtraCategoryTotals map[string]float64 `bson:"extraCategoryTotals,omitempty"`
	TransactionFeeTotal float64            `bson:"transactionFeeTotal"`
	BrokersFeeTotal     float64            `bson:"brokersFeeTotal"`
	ProfitLoss          float64            `bson:"profitLoss"`
}

// CorpRollupMonthlyBucket is a pre-aggregated calendar month for GET .../corp-build-stats/rollup.
// Lane is CorpRollupOwnedLane for corpRef-only snapshot rows; otherwise the Firebase accountID for account-linked rows.
type CorpRollupMonthlyBucket struct {
	ID                  string             `bson:"_id"`
	CorpRef             string             `bson:"corpRef"`
	Lane                string             `bson:"lane"`
	TypeID              int                `bson:"typeID"`
	Year                int                `bson:"year"`
	Month               int                `bson:"month"`
	TransactionCount    int64              `bson:"transactionCount"`
	QuantitySold        float64            `bson:"quantitySold"`
	SalesTotal          float64            `bson:"salesTotal"`
	JobCostTotal        float64            `bson:"jobCostTotal"`
	ExtraCategoryTotals map[string]float64 `bson:"extraCategoryTotals,omitempty"`
	TransactionFeeTotal float64            `bson:"transactionFeeTotal"`
	BrokersFeeTotal     float64            `bson:"brokersFeeTotal"`
	ProfitLoss          float64            `bson:"profitLoss"`
}

// EmptyBuildStatsRow returns a zeroed aggregate for typeID when no Mongo document exists yet.
// Matches the JSON shape of a real row so clients can always parse 200 responses.
func EmptyBuildStatsRow(typeID int) BuildStatsRow {
	return BuildStatsRow{
		TypeID: typeID,
	}
}

// AddBuildStatsSegmentTotals sums segment headline fields.
func AddBuildStatsSegmentTotals(dst, src BuildStatsSegmentTotals) BuildStatsSegmentTotals {
	dst.TotalJobs += src.TotalJobs
	dst.ItemBuildCount += src.ItemBuildCount
	dst.BuildCostTotal += src.BuildCostTotal
	dst.TotalSoldQuantity += src.TotalSoldQuantity
	dst.BrokersFeeTotal += src.BrokersFeeTotal
	dst.TransactionFeeTotal += src.TransactionFeeTotal
	dst.JobCostTotal += src.JobCostTotal
	dst.SalesTotal += src.SalesTotal
	dst.ProfitLoss += src.ProfitLoss
	return dst
}

// AddBuildStatsBreakdown sums all three segments (used when merging corp-scoped + personal Mongo rows).
func AddBuildStatsBreakdown(dst, src BuildStatsBreakdown) BuildStatsBreakdown {
	dst.ProductionChain = AddBuildStatsSegmentTotals(dst.ProductionChain, src.ProductionChain)
	dst.RetainedStock = AddBuildStatsSegmentTotals(dst.RetainedStock, src.RetainedStock)
	dst.StandaloneRecordedSale = AddBuildStatsSegmentTotals(dst.StandaloneRecordedSale, src.StandaloneRecordedSale)
	return dst
}

// AddBuildStatsRows sums numeric fields from src into dst (same typeID). JobType is taken from the first non-zero.
func AddBuildStatsRows(dst, src BuildStatsRow) BuildStatsRow {
	if dst.JobType == 0 && src.JobType != 0 {
		dst.JobType = src.JobType
	}
	dst.TotalJobs += src.TotalJobs
	dst.ItemBuildCount += src.ItemBuildCount
	dst.BuildCostTotal += src.BuildCostTotal
	dst.BrokersFeeTotal += src.BrokersFeeTotal
	dst.TransactionFeeTotal += src.TransactionFeeTotal
	dst.JobCostTotal += src.JobCostTotal
	dst.SalesTotal += src.SalesTotal
	dst.ProfitLoss += src.ProfitLoss
	dst.Breakdown = AddBuildStatsBreakdown(dst.Breakdown, src.Breakdown)
	return dst
}
