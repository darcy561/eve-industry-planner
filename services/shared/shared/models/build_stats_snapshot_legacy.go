package models

// BuildStatSnapshot is retained for snapshotter arithmetic internals.
type BuildStatSnapshot struct {
	TypeID              int     `json:"typeID" bson:"typeID"`
	JobID               string  `json:"jobID" bson:"jobID"`
	JobType             int     `json:"jobType" bson:"jobType"`
	ProcessDate         int64   `json:"processDate" bson:"processDate"`
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
