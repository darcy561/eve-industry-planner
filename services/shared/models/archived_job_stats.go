package models

import (
	"time"
)

// ArchivedJobCostTotals is the cost side of one archived job.
type ArchivedJobCostTotals struct {
	TotalProduced      float64 `bson:"totalProduced" json:"totalProduced"`
	TotalMaterialCost  float64 `bson:"totalMaterialCost" json:"totalMaterialCost"`
	TotalInstallCost   float64 `bson:"totalInstallCost" json:"totalInstallCost"`
	TotalExtras        float64 `bson:"totalExtras" json:"totalExtras"`
	TotalInventionCost float64 `bson:"totalInventionCost" json:"totalInventionCost"`
	TotalCostPerItem   float64 `bson:"totalCostPerItem" json:"totalCostPerItem"`
}

// ArchivedJobLine is the shared shape of a sale line on an archived job.
type ArchivedJobLine struct {
	OrderID       int       `bson:"orderID,omitempty" json:"orderID,omitempty"`
	Date          time.Time `bson:"date" json:"date"`
	CalendarMonth `bson:",inline"`
	Amount        float64 `bson:"amount" json:"amount"`
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
	ExtraCategoryTotals   map[string]float64           `bson:"extraCategoryTotals,omitempty" json:"extraCategoryTotals,omitempty"`
	UnsoldQuantity        float64                      `bson:"unsoldQuantity" json:"unsoldQuantity"`
	UnsoldCost            float64                      `bson:"unsoldCost" json:"unsoldCost"`
	TransactionLines      []ArchivedJobTransactionLine `bson:"transactionLines" json:"transactionLines"`
	FeeLines              []ArchivedJobFeeLine         `bson:"feeLines" json:"feeLines"`
	Protected             *FieldProtection             `bson:"protected,omitempty" json:"-"`
	ProcessedAt           time.Time                    `bson:"processedAt" json:"processedAt"`
	// ContributedAt records that this row's figures have been added to the
	// aggregates above it. It is both the guard against adding them twice and the
	// list of what is still outstanding: the rows without one are the work.
	ContributedAt *time.Time `bson:"contributedAt,omitempty" json:"-"`
	Revoked       bool       `bson:"revoked" json:"revoked"`
	RevokedAt     *time.Time `bson:"revokedAt,omitempty" json:"revokedAt,omitempty"`
	Version       int        `bson:"version" json:"version"`
}

// AwaitsContribution reports whether this row's figures are not yet in the
// aggregates above it.
//
// This is the rule LoadUncountedStatsRows selects on. Both say the same thing:
// a live row with no stamp is outstanding work.
func (s ArchivedJobStats) AwaitsContribution() bool {
	return !s.Revoked && s.ContributedAt == nil
}

// AwaitsRemoval reports whether this row's figures are still counted although its
// job is no longer archived.
//
// This is the rule LoadRevokedContributedRows selects on.
func (s ArchivedJobStats) AwaitsRemoval() bool {
	return s.Revoked && s.ContributedAt != nil
}

// CostParts reads what the job cost from the reduced row. The same six
// components Job.CostParts reads, from the other representation; the arithmetic
// over them belongs to JobCostParts.
func (s ArchivedJobStats) CostParts() JobCostParts {
	parts := JobCostParts{
		Materials: s.TotalMaterialCost,
		Install:   s.TotalInstallCost,
		Invention: s.TotalInventionCost,
		Extras:    s.TotalExtras,
	}
	for _, line := range s.FeeLines {
		parts.BrokersFee += line.Amount
	}
	for _, line := range s.TransactionLines {
		parts.TransactionFee += line.Tax
	}
	return parts
}

// SalesTotal sums what the row's transaction lines brought in.
func (s ArchivedJobStats) SalesTotal() float64 {
	var sales float64
	for _, line := range s.TransactionLines {
		sales += line.Amount
	}
	return sales
}
