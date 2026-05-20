package models

import (
	"time"

	"eve-industry-planner/shared/core/sealedfields"
)

type ArchivedJobStats struct {
	ID        string `bson:"_id" json:"-"`
	AccountID string `bson:"accountID" json:"accountID"`
	// CorpRef identifies corp-owned snapshots when AccountID is empty (_id is corpRef|jobID).
	CorpRef           string `bson:"corpRef,omitempty" json:"corpRef,omitempty"`
	JobID             string `bson:"jobID" json:"jobID"`
	TypeID            int    `bson:"typeID" json:"typeID"`
	JobType           int    `bson:"jobType" json:"jobType"`
	IsProductionChain bool   `bson:"isProductionChain" json:"isProductionChain"`
	// RetainedStockBuild — user marked this archived job as stock / retained output (counts as retained segment).
	RetainedStockBuild bool      `bson:"retainedStockBuild,omitempty" json:"retainedStockBuild,omitempty"`
	ArchivedAt         time.Time `bson:"archivedAt" json:"archivedAt"`
	// CostYear/CostMonth pins job-cost attribution month for rollups (stable across rebuilds).
	// When zero/missing (legacy snapshots), workers fall back to ArchivedAt.
	CostYear           int     `bson:"costYear,omitempty" json:"costYear,omitempty"`
	CostMonth          int     `bson:"costMonth,omitempty" json:"costMonth,omitempty"`
	TotalProduced      float64 `bson:"totalProduced" json:"totalProduced"`
	TotalMaterialCost  float64 `bson:"totalMaterialCost" json:"totalMaterialCost"`
	TotalInstallCost   float64 `bson:"totalInstallCost" json:"totalInstallCost"`
	TotalExtras        float64 `bson:"totalExtras" json:"totalExtras"`
	TotalInventionCost float64 `bson:"totalInventionCost" json:"totalInventionCost"`
	TotalBuildCosts    float64 `bson:"totalBuildCosts" json:"totalBuildCosts"`
	TotalCostPerItem   float64 `bson:"totalCostPerItem" json:"totalCostPerItem"`
	// ExtraCategoryTotals stores summed extras costs by category id from Job.Build.Costs.ExtrasCosts.
	ExtraCategoryTotals map[string]float64 `bson:"extraCategoryTotals,omitempty" json:"extraCategoryTotals,omitempty"`
	UnsoldQuantity      float64            `bson:"unsoldQuantity" json:"unsoldQuantity"`
	UnsoldCost          float64            `bson:"unsoldCost" json:"unsoldCost"`
	// LinkedIndustryCorpIDs is distinct corporation_id values from build.costs.linkedJobs (industry jobs).
	// Used when there are no sale tx/fee lines but linked facility jobs identify the corp (typical production-chain intermediates).
	LinkedIndustryCorpIDs []int                        `bson:"linkedIndustryCorpIDs,omitempty" json:"linkedIndustryCorpIDs,omitempty"`
	TransactionLines      []ArchivedJobTransactionLine `bson:"transactionLines" json:"transactionLines"`
	FeeLines              []ArchivedJobFeeLine         `bson:"feeLines" json:"feeLines"`
	Sealed                *sealedfields.SealedFields   `bson:"sealed,omitempty" json:"-"`
	ProcessedAt           time.Time                    `bson:"processedAt" json:"processedAt"`
	Revoked               bool                         `bson:"revoked" json:"revoked"`
	RevokedAt             *time.Time                   `bson:"revokedAt,omitempty" json:"revokedAt,omitempty"`
	Version               int                          `bson:"version" json:"version"`
}

type ArchivedJobTransactionLine struct {
	TransactionID int64     `bson:"transactionID" json:"transactionID"`
	OrderID       int       `bson:"orderID,omitempty" json:"orderID,omitempty"`
	Date          time.Time `bson:"date" json:"date"`
	Year          int       `bson:"year" json:"year"`
	Month         int       `bson:"month" json:"month"`
	Quantity      float64   `bson:"quantity" json:"quantity"`
	Amount        float64   `bson:"amount" json:"amount"`
	Tax           float64   `bson:"tax" json:"tax"`
	ProratedCost  float64   `bson:"proratedCost" json:"proratedCost"`
	Profit        float64   `bson:"profit" json:"profit"`
	IsCorp        bool      `bson:"isCorp" json:"isCorp"`
	CorpStatus    string    `bson:"corpStatus" json:"corpStatus"` // personal|corp_known|corp_unknown
	// ResolvedCorpID is the numeric corp used for corp_build_stats when tx/order maps
	// in the sealed envelope are missing (historic jobs). Omitted when zero.
	ResolvedCorpID int `bson:"resolvedCorpID,omitempty" json:"resolvedCorpID,omitempty"`
}

type ArchivedJobFeeLine struct {
	FeeID          int64     `bson:"feeID" json:"feeID"`
	OrderID        int       `bson:"orderID" json:"orderID"`
	Date           time.Time `bson:"date" json:"date"`
	Year           int       `bson:"year" json:"year"`
	Month          int       `bson:"month" json:"month"`
	Amount         float64   `bson:"amount" json:"amount"`
	IsCorp         bool      `bson:"isCorp" json:"isCorp"`
	CorpStatus     string    `bson:"corpStatus" json:"corpStatus"` // personal|corp_known|corp_unknown
	ResolvedCorpID int       `bson:"resolvedCorpID,omitempty" json:"resolvedCorpID,omitempty"`
}
