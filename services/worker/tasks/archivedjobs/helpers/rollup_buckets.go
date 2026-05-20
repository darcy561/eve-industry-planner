package helpers

import (
	"context"
	"time"

	authzhmac "eve-industry-planner/shared/core/crypto/authzhmac/helper"
	"eve-industry-planner/shared/models"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
)

// RollupMonthlyLineAccumulator aggregates transaction and broker fee lines the same way as the statistics rollup API.
type RollupMonthlyLineAccumulator struct {
	TransactionCount    int64
	QuantitySold        float64
	SalesTotal          float64
	JobCostTotal        float64
	ExtraCategoryTotals map[string]float64
	TransactionFeeTotal float64
	BrokersFeeTotal     float64
	ProfitLoss          float64
}

func (a *RollupMonthlyLineAccumulator) AddTxn(t models.ArchivedJobTransactionLine) {
	a.TransactionCount++
	a.QuantitySold += t.Quantity
	a.SalesTotal += t.Amount
	a.TransactionFeeTotal += t.Tax
	a.ProfitLoss += (t.Amount - t.Tax)
}

func (a *RollupMonthlyLineAccumulator) AddFee(f models.ArchivedJobFeeLine) {
	a.BrokersFeeTotal += f.Amount
	a.ProfitLoss -= f.Amount
}

func (a *RollupMonthlyLineAccumulator) AddJobCost(total float64) {
	a.JobCostTotal += total
	a.ProfitLoss -= total
}

func (a *RollupMonthlyLineAccumulator) AddExtraCategoryTotals(totals map[string]float64) {
	if len(totals) == 0 {
		return
	}
	if a.ExtraCategoryTotals == nil {
		a.ExtraCategoryTotals = map[string]float64{}
	}
	for id, v := range totals {
		if id == "" {
			continue
		}
		a.ExtraCategoryTotals[id] += v
	}
}

func jobCostYearMonth(doc *models.ArchivedJobStats) (int, int) {
	if doc != nil && doc.CostYear > 0 && doc.CostMonth >= 1 && doc.CostMonth <= 12 {
		return doc.CostYear, doc.CostMonth
	}
	if doc != nil && !doc.ArchivedAt.IsZero() {
		return doc.ArchivedAt.Year(), int(doc.ArchivedAt.Month())
	}
	now := time.Now().UTC()
	return now.Year(), int(now.Month())
}

// LoadNonRevokedCorpArchivedJobStats loads corp_archived_job_stats snapshots used for corp aggregate rebuild.
func LoadNonRevokedCorpArchivedJobStats(ctx context.Context, snapshotColl *mongo.Collection) ([]models.ArchivedJobStats, error) {
	cur, err := snapshotColl.Find(ctx, bson.M{"revoked": bson.M{"$ne": true}})
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)
	var docs []models.ArchivedJobStats
	if err := cur.All(ctx, &docs); err != nil {
		return nil, err
	}
	return docs, nil
}

// UserRollupMonthTypeKey buckets personal rollup docs by item type × calendar month.
type UserRollupMonthTypeKey struct {
	TypeID int
	Year   int
	Month  int
}

// AccumulateUserRollupMonthly groups active user_archived_job_stats snapshots into monthly per-type rollup accumulators.
func AccumulateUserRollupMonthly(docs []models.ArchivedJobStats) map[UserRollupMonthTypeKey]*RollupMonthlyLineAccumulator {
	out := make(map[UserRollupMonthTypeKey]*RollupMonthlyLineAccumulator)
	for _, doc := range docs {
		if doc.Revoked || doc.IsProductionChain {
			continue
		}
		kBase := UserRollupMonthTypeKey{TypeID: doc.TypeID}
		for _, t := range doc.TransactionLines {
			k := kBase
			k.Year, k.Month = t.Year, t.Month
			row := out[k]
			if row == nil {
				row = &RollupMonthlyLineAccumulator{}
				out[k] = row
			}
			row.AddTxn(t)
		}
		for _, f := range doc.FeeLines {
			k := kBase
			k.Year, k.Month = f.Year, f.Month
			row := out[k]
			if row == nil {
				row = &RollupMonthlyLineAccumulator{}
				out[k] = row
			}
			row.AddFee(f)
		}
		k := kBase
		k.Year, k.Month = jobCostYearMonth(&doc)
		row := out[k]
		if row == nil {
			row = &RollupMonthlyLineAccumulator{}
			out[k] = row
		}
		row.AddJobCost(doc.TotalBuildCosts + doc.TotalInstallCost + doc.TotalExtras + doc.TotalInventionCost)
		row.AddExtraCategoryTotals(doc.ExtraCategoryTotals)
	}
	return out
}

// CorpRollupBucketKey identifies one corp rollup bucket row (_id derives from corpRef|lane|typeID|YM).
type CorpRollupBucketKey struct {
	CorpRef string
	Lane    string
	TypeID  int
	Year    int
	Month   int
}

func archivedDistinctResolvedCorpIDs(doc *models.ArchivedJobStats) []int {
	seen := make(map[int]struct{})
	add := func(n int) {
		if n > 0 {
			seen[n] = struct{}{}
		}
	}
	for _, t := range doc.TransactionLines {
		add(t.ResolvedCorpID)
	}
	for _, f := range doc.FeeLines {
		add(f.ResolvedCorpID)
	}
	for _, cid := range doc.LinkedIndustryCorpIDs {
		add(cid)
	}
	if len(seen) == 0 {
		return nil
	}
	out := make([]int, 0, len(seen))
	for id := range seen {
		out = append(out, id)
	}
	return out
}

// CorpRollupLaneForCorpRef returns rollup lane attribution for corpRef (opaque): owned lane "~" wins over account lane.
func CorpRollupLaneForCorpRef(doc *models.ArchivedJobStats, corpRef string, corpIDs []int, h *authzhmac.Helper) (lane string, ok bool) {
	if doc.Revoked || doc.IsProductionChain {
		return "", false
	}
	if doc.CorpRef == corpRef {
		return models.CorpRollupOwnedLane, true
	}
	if doc.AccountID == "" || h == nil {
		return "", false
	}
	for _, cid := range corpIDs {
		ref, err := h.RefFromCorporationID(int64(cid))
		if err != nil || ref != corpRef {
			continue
		}
		return doc.AccountID, true
	}
	return "", false
}

// AccumulateCorpRollupMonthly builds monthly buckets for each dirty corp ref from the full corp snapshot corpus.
func AccumulateCorpRollupMonthly(
	docs []models.ArchivedJobStats,
	dirtyCorpRefs map[string]struct{},
	h *authzhmac.Helper,
) map[CorpRollupBucketKey]*RollupMonthlyLineAccumulator {
	out := make(map[CorpRollupBucketKey]*RollupMonthlyLineAccumulator)
	if len(dirtyCorpRefs) == 0 {
		return out
	}

	for i := range docs {
		doc := &docs[i]
		if doc.Revoked || doc.IsProductionChain {
			continue
		}
		corpIDs := archivedDistinctResolvedCorpIDs(doc)
		for corpRef := range dirtyCorpRefs {
			if corpRef == "" {
				continue
			}
			lane, ok := CorpRollupLaneForCorpRef(doc, corpRef, corpIDs, h)
			if !ok {
				continue
			}
			for _, t := range doc.TransactionLines {
				key := CorpRollupBucketKey{CorpRef: corpRef, Lane: lane, TypeID: doc.TypeID, Year: t.Year, Month: t.Month}
				row := out[key]
				if row == nil {
					row = &RollupMonthlyLineAccumulator{}
					out[key] = row
				}
				row.AddTxn(t)
			}
			for _, f := range doc.FeeLines {
				key := CorpRollupBucketKey{CorpRef: corpRef, Lane: lane, TypeID: doc.TypeID, Year: f.Year, Month: f.Month}
				row := out[key]
				if row == nil {
					row = &RollupMonthlyLineAccumulator{}
					out[key] = row
				}
				row.AddFee(f)
			}
			costYear, costMonth := jobCostYearMonth(doc)
			costKey := CorpRollupBucketKey{
				CorpRef: corpRef,
				Lane:    lane,
				TypeID:  doc.TypeID,
				Year:    costYear,
				Month:   costMonth,
			}
			costRow := out[costKey]
			if costRow == nil {
				costRow = &RollupMonthlyLineAccumulator{}
				out[costKey] = costRow
			}
			costRow.AddJobCost(doc.TotalBuildCosts + doc.TotalInstallCost + doc.TotalExtras + doc.TotalInventionCost)
			costRow.AddExtraCategoryTotals(doc.ExtraCategoryTotals)
		}
	}
	return out
}
