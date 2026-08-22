package models

import (
	"time"
)

// ArchivedJobCorpStatus records how a sale line was attributed when corporation
// statistics were built.
type ArchivedJobCorpStatus string

const (
	CorpStatusPersonal    ArchivedJobCorpStatus = "personal"
	CorpStatusCorpKnown   ArchivedJobCorpStatus = "corp_known"
	CorpStatusCorpUnknown ArchivedJobCorpStatus = "corp_unknown"
)

// ArchivedJobCostTotals is the cost side of one archived job.
type ArchivedJobCostTotals struct {
	TotalProduced      float64 `bson:"totalProduced" json:"totalProduced"`
	TotalMaterialCost  float64 `bson:"totalMaterialCost" json:"totalMaterialCost"`
	TotalInstallCost   float64 `bson:"totalInstallCost" json:"totalInstallCost"`
	TotalExtras        float64 `bson:"totalExtras" json:"totalExtras"`
	TotalInventionCost float64 `bson:"totalInventionCost" json:"totalInventionCost"`
	TotalBuildCosts    float64 `bson:"totalBuildCosts" json:"totalBuildCosts"`
	TotalCostPerItem   float64 `bson:"totalCostPerItem" json:"totalCostPerItem"`
}

// ArchivedJobLine is the shared shape of a sale line on an archived job.
type ArchivedJobLine struct {
	OrderID       int       `bson:"orderID,omitempty" json:"orderID,omitempty"`
	Date          time.Time `bson:"date" json:"date"`
	CalendarMonth `bson:",inline"`
	Amount        float64               `bson:"amount" json:"amount"`
	IsCorp        bool                  `bson:"isCorp" json:"isCorp"`
	CorpStatus    ArchivedJobCorpStatus `bson:"corpStatus" json:"corpStatus"`
	// ResolvedCorpRef names the corporation a line was attributed to when the job's
	// own line refs did not identify one.
	ResolvedCorpRef string `bson:"resolvedCorpRef,omitempty" json:"resolvedCorpRef,omitempty"`
}

type ArchivedJobTransactionLine struct {
	TransactionID   int64 `bson:"transactionID" json:"transactionID"`
	ArchivedJobLine `bson:",inline"`
	Quantity        float64 `bson:"quantity" json:"quantity"`
	Tax             float64 `bson:"tax" json:"tax"`
	ProratedCost    float64 `bson:"proratedCost" json:"proratedCost"`
	Profit          float64 `bson:"profit" json:"profit"`
}

type ArchivedJobFeeLine struct {
	FeeID           int64 `bson:"feeID" json:"feeID"`
	ArchivedJobLine `bson:",inline"`
}

// ArchivedJobStats is one archived job reduced to the figures the statistics
// pipelines read. AccountID owns account-scoped rows; CorpRef owns rows archived
// under a corporation with no account owner.
type ArchivedJobStats struct {
	ID                string `bson:"_id" json:"-"`
	AccountID         string `bson:"accountID" json:"accountID"`
	CorpRef           string `bson:"corpRef,omitempty" json:"corpRef,omitempty"`
	JobID             string `bson:"jobID" json:"jobID"`
	TypeID            int    `bson:"typeID" json:"typeID"`
	JobType           int    `bson:"jobType" json:"jobType"`
	IsProductionChain bool   `bson:"isProductionChain" json:"isProductionChain"`
	// RetainedStockBuild marks a job the user keeps as stock rather than selling.
	RetainedStockBuild bool      `bson:"retainedStockBuild,omitempty" json:"retainedStockBuild,omitempty"`
	ArchivedAt         time.Time `bson:"archivedAt" json:"archivedAt"`
	// CostMonth pins job-cost attribution so monthly figures stay stable across rebuilds.
	// Workers fall back to ArchivedAt when it is zero.
	CostMonth             CalendarMonth `bson:"costMonth" json:"costMonth,omitzero"`
	ArchivedJobCostTotals `bson:",inline"`
	ExtraCategoryTotals   map[string]float64 `bson:"extraCategoryTotals,omitempty" json:"extraCategoryTotals,omitempty"`
	UnsoldQuantity        float64            `bson:"unsoldQuantity" json:"unsoldQuantity"`
	UnsoldCost            float64            `bson:"unsoldCost" json:"unsoldCost"`
	// LinkedIndustryCorpRefs identifies the corporation from linked facility jobs
	// when a production-chain intermediate has no sale lines of its own.
	LinkedIndustryCorpRefs []string                     `bson:"linkedIndustryCorpRefs,omitempty" json:"linkedIndustryCorpRefs,omitempty"`
	TransactionLines       []ArchivedJobTransactionLine `bson:"transactionLines" json:"transactionLines"`
	FeeLines               []ArchivedJobFeeLine         `bson:"feeLines" json:"feeLines"`
	Protected              *FieldProtection             `bson:"protected,omitempty" json:"-"`
	ProcessedAt            time.Time                    `bson:"processedAt" json:"processedAt"`
	Revoked                bool                         `bson:"revoked" json:"revoked"`
	RevokedAt              *time.Time                   `bson:"revokedAt,omitempty" json:"revokedAt,omitempty"`
	Version                int                          `bson:"version" json:"version"`
}
