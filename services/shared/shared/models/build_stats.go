package models

// BuildStatsRow is one document in MongoDB build_stats (aggregates from ProcessBuildStats;
// same field names as legacy Firestore Users/{uid}/BuildStats/{typeID}).
type BuildStatsRow struct {
	ID                  string              `bson:"_id" json:"-"`
	JobType             int                 `bson:"jobType" json:"jobType"`
	TypeID              int                 `bson:"typeID" json:"typeID"`
	TotalJobs           int64               `bson:"totalJobs" json:"totalJobs"`
	ItemBuildCount      float64             `bson:"itemBuildCount" json:"itemBuildCount"`
	BuildCostTotal      float64             `bson:"buildCostTotal" json:"buildCostTotal"`
	BrokersFeeTotal     float64             `bson:"brokersFeeTotal" json:"brokersFeeTotal"`
	TransactionFeeTotal float64             `bson:"transactionFeeTotal" json:"transactionFeeTotal"`
	JobCostTotal        float64             `bson:"jobCostTotal" json:"jobCostTotal"`
	SalesTotal          float64             `bson:"salesTotal" json:"salesTotal"`
	ProfitLoss          float64             `bson:"profitLoss" json:"profitLoss"`
	DataSnapshots       []BuildStatSnapshot `bson:"dataSnapshots" json:"dataSnapshots"`
}

// BuildStatSnapshot is one archived job's contribution stored in build_stats.dataSnapshots
// (matches Firebase archievedJobs.js archiveObject).
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
	TotalBuildCosts     float64 `json:"totalBuildCosts" bson:"totalBuildCosts"`
	BrokersFeeTotal     float64 `json:"brokersFeeTotal" bson:"brokersFeeTotal"`
	TransactionFeeTotal float64 `json:"transactionFeeTotal" bson:"transactionFeeTotal"`
	TotalJobCost        float64 `json:"totalJobCost" bson:"totalJobCost"`
	TotalCostPerItem    float64 `json:"totalCostPerItem" bson:"totalCostPerItem"`
	TotalSales          float64 `json:"totalSales" bson:"totalSales"`
	AverageSalePrice    float64 `json:"averageSalePrice" bson:"averageSalePrice"`
	ProfitLoss          float64 `json:"profitLoss" bson:"profitLoss"`
	CorpMarketOrder     bool    `json:"corpMarketOrder" bson:"corpMarketOrder"`
	CorpIndustryJob     bool    `json:"corpIndustryJob" bson:"corpIndustryJob"`
}

// EmptyBuildStatsRow returns a zeroed aggregate for typeID when no Mongo document exists yet.
// Matches the JSON shape of a real row so clients can always parse 200 responses.
func EmptyBuildStatsRow(typeID int) BuildStatsRow {
	return BuildStatsRow{
		TypeID:        typeID,
		DataSnapshots: []BuildStatSnapshot{},
	}
}
