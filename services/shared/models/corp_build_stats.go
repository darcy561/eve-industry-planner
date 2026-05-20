package models

type CorpBuildStatsRow struct {
	ID                  string              `bson:"_id" json:"-"`
	CorpRef             string              `bson:"corpRef" json:"corpRef"`
	TypeID              int                 `bson:"typeID" json:"typeID"`
	TotalJobs           int64               `bson:"totalJobs" json:"totalJobs"`
	ItemBuildCount      float64             `bson:"itemBuildCount" json:"itemBuildCount"`
	BuildCostTotal      float64             `bson:"buildCostTotal" json:"buildCostTotal"`
	BrokersFeeTotal     float64             `bson:"brokersFeeTotal" json:"brokersFeeTotal"`
	TransactionFeeTotal float64             `bson:"transactionFeeTotal" json:"transactionFeeTotal"`
	JobCostTotal        float64             `bson:"jobCostTotal" json:"jobCostTotal"`
	SalesTotal          float64             `bson:"salesTotal" json:"salesTotal"`
	// Net margin: salesTotal − brokers − transaction fees − jobCostTotal (corp rebuild).
	ProfitLoss          float64             `bson:"profitLoss" json:"profitLoss"`
	Breakdown           BuildStatsBreakdown `bson:"breakdown,omitempty" json:"breakdown,omitempty"`
}

type CorpBuildStatsTimelineBucket struct {
	ID                  string  `bson:"_id" json:"-"`
	CorpRef             string  `bson:"corpRef" json:"corpRef"`
	TypeID              int     `bson:"typeID" json:"typeID"`
	Year                int     `bson:"year" json:"year"`
	Month               int     `bson:"month" json:"month"`
	TransactionCount    int64   `bson:"transactionCount" json:"transactionCount"`
	QuantitySold        float64 `bson:"quantitySold" json:"quantitySold"`
	SalesTotal          float64 `bson:"salesTotal" json:"salesTotal"`
	TransactionFeeTotal float64 `bson:"transactionFeeTotal" json:"transactionFeeTotal"`
	BrokersFeeTotal     float64 `bson:"brokersFeeTotal" json:"brokersFeeTotal"`
	ProfitLoss          float64 `bson:"profitLoss" json:"profitLoss"`
}
