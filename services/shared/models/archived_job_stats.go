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
// pipelines read.
type ArchivedJobStats struct {
	ID            string `bson:"_id" json:"-"`
	SchemaVersion int    `bson:"schemaVersion,omitempty" json:"-"`
	// Owner is who the row belongs to, and what every query for it filters on.
	Owner Owner `bson:"owner" json:"-"`
	// ArchivedBy is the account that archived the job, which inside a shared
	// planner is not the same question as who owns the row.
	ArchivedBy        string    `bson:"archivedBy,omitempty" json:"-"`
	JobID             string    `bson:"jobID" json:"jobID"`
	TypeID            int       `bson:"typeID" json:"typeID"`
	JobType           int       `bson:"jobType" json:"jobType"`
	IsProductionChain bool      `bson:"isProductionChain" json:"isProductionChain"`
	ArchivedAt        time.Time `bson:"archivedAt" json:"archivedAt"`
	// CostMonth pins job-cost attribution so monthly figures stay stable across rebuilds.
	// Workers fall back to ArchivedAt when it is zero.
	CostMonth             CalendarMonth `bson:"costMonth" json:"costMonth,omitzero"`
	ArchivedJobCostTotals `bson:",inline"`
	// ExtraCategories is what the job's extras cost, per category, each carrying
	// the name it was archived under.
	ExtraCategories  []ArchivedExtraCategory      `bson:"extraCategories,omitempty" json:"extraCategories,omitempty"`
	UnsoldQuantity   float64                      `bson:"unsoldQuantity" json:"unsoldQuantity"`
	UnsoldCost       float64                      `bson:"unsoldCost" json:"unsoldCost"`
	TransactionLines []ArchivedJobTransactionLine `bson:"transactionLines" json:"transactionLines"`
	FeeLines         []ArchivedJobFeeLine         `bson:"feeLines" json:"feeLines"`
	Protected        *FieldProtection             `bson:"protected,omitempty" json:"-"`
	ProcessedAt      time.Time                    `bson:"processedAt" json:"processedAt"`
	// ContributedAt records that this row's figures have been added to the
	// aggregates above it. It is both the guard against adding them twice and the
	// list of what is still outstanding: the rows without one are the work.
	ContributedAt *time.Time `bson:"contributedAt,omitempty" json:"-"`
	// MonthsFiled records that the job named one of its months rather than the
	// reduction deriving it, so a figure that disagrees with the job's dates can
	// be read as a choice rather than a fault.
	MonthsFiled bool `bson:"monthsFiled,omitempty" json:"-"`
	// SkippedAt marks a row whose job could no longer be reduced, so the figures
	// below are the last ones that could be computed rather than the job's
	// current worth. The row stays in the aggregates; a rebuild that can read the
	// job again replaces it and clears the stamp.
	SkippedAt  *time.Time `bson:"skippedAt,omitempty" json:"-"`
	SkipReason string     `bson:"skipReason,omitempty" json:"-"`
	Revoked    bool       `bson:"revoked" json:"revoked"`
	RevokedAt  *time.Time `bson:"revokedAt,omitempty" json:"revokedAt,omitempty"`
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
// FiguresAreStale reports a row the last rebuild could not recompute.
func (s ArchivedJobStats) FiguresAreStale() bool {
	return s.SkippedAt != nil
}

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

// ArchivedExtraCategory is one extras category's share of a job's costs, with the
// name it carried at the time.
//
// The name is stored rather than looked up because the list it would be looked up
// in is a per-account setting: a category deleted there leaves the archive naming
// an id nobody can read, and a member of a shared planner has none of another
// member's categories in their own list.
type ArchivedExtraCategory struct {
	ID     string  `bson:"id" json:"id"`
	Label  string  `bson:"label" json:"label"`
	Amount float64 `bson:"amount" json:"amount"`
}
