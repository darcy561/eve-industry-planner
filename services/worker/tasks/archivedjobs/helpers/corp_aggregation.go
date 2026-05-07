package helpers

import (
	"sort"

	"eve-industry-planner/shared/core/authzhmac"
	corecrypto "eve-industry-planner/shared/core/crypto"
	"eve-industry-planner/shared/core/jobid/corpinference"
	"eve-industry-planner/shared/core/sealedfields"
	"eve-industry-planner/shared/core/sealedfields/entityids"
	"eve-industry-planner/shared/shared/models"
)

type CorpLifetimeKey struct {
	CorpRef string
	TypeID  int
}

type CorpBucketKey struct {
	CorpRef string
	TypeID  int
	Year    int
	Month   int
}

func AccumulateCorpBuildStats(
	docs []models.ArchivedJobStats,
	keyring *corecrypto.Keyring,
	hmacHelper *authzhmac.Helper,
) (map[CorpLifetimeKey]*models.CorpBuildStatsRow, map[CorpBucketKey]*models.CorpBuildStatsTimelineBucket) {
	lifetimes := map[CorpLifetimeKey]*models.CorpBuildStatsRow{}
	buckets := map[CorpBucketKey]*models.CorpBuildStatsTimelineBucket{}

	for _, doc := range docs {
		seg := ClassifyArchivedJobStatsSegment(doc)
		txCorp := map[int64]int{}
		orderCorp := map[int]int{}
		var plaintext []byte
		if doc.Sealed != nil && keyring != nil {
			if pt, openErr := sealedfields.Open(keyring, doc.Sealed); openErr == nil {
				plaintext = pt
			}
		}
		if len(plaintext) > 0 {
			if parsed, e := entityids.TransactionCorporationsFromPlaintext(plaintext); e == nil {
				txCorp = parsed
			}
			if parsed, e := entityids.OrderCorporationsFromPlaintext(plaintext); e == nil {
				orderCorp = parsed
			}
		}
		linkedFallbackCorpID, linkedFallbackOK := 0, false
		if len(plaintext) > 0 {
			if ljMap, e := entityids.LinkedJobCorporationsFromPlaintext(plaintext); e == nil {
				linkedFallbackCorpID, linkedFallbackOK = corpinference.InferSingleDistinctCorpIDFromLinkedJobMap(ljMap)
			}
		}
		docTouched := map[CorpLifetimeKey]struct{}{}

		for _, t := range doc.TransactionLines {
			if t.CorpStatus != "corp_known" {
				continue
			}
			corpID := txCorp[t.TransactionID]
			if corpID <= 0 && t.OrderID != 0 {
				corpID = orderCorp[t.OrderID]
			}
			if corpID <= 0 {
				corpID = t.ResolvedCorpID
			}
			if corpID <= 0 && linkedFallbackOK {
				corpID = linkedFallbackCorpID
			}
			if corpID <= 0 {
				continue
			}
			corpRef, refErr := hmacHelper.RefFromCorporationID(int64(corpID))
			if refErr != nil {
				continue
			}
			lk := CorpLifetimeKey{CorpRef: corpRef, TypeID: doc.TypeID}
			row := lifetimes[lk]
			if row == nil {
				row = &models.CorpBuildStatsRow{CorpRef: corpRef, TypeID: doc.TypeID}
				lifetimes[lk] = row
			}
			row.TransactionFeeTotal += t.Tax
			row.SalesTotal += t.Amount
			addCorpTransactionToBreakdown(&row.Breakdown, seg, t)
			docTouched[lk] = struct{}{}

			bk := CorpBucketKey{CorpRef: corpRef, TypeID: doc.TypeID, Year: t.Year, Month: t.Month}
			b := buckets[bk]
			if b == nil {
				b = &models.CorpBuildStatsTimelineBucket{
					CorpRef: corpRef, TypeID: doc.TypeID, Year: t.Year, Month: t.Month,
				}
				buckets[bk] = b
			}
			b.TransactionCount++
			b.QuantitySold += t.Quantity
			b.SalesTotal += t.Amount
			b.TransactionFeeTotal += t.Tax
		}

		for _, f := range doc.FeeLines {
			if f.CorpStatus != "corp_known" {
				continue
			}
			corpID := orderCorp[f.OrderID]
			if corpID <= 0 {
				corpID = f.ResolvedCorpID
			}
			if corpID <= 0 && linkedFallbackOK {
				corpID = linkedFallbackCorpID
			}
			if corpID <= 0 {
				continue
			}
			corpRef, refErr := hmacHelper.RefFromCorporationID(int64(corpID))
			if refErr != nil {
				continue
			}
			lk := CorpLifetimeKey{CorpRef: corpRef, TypeID: doc.TypeID}
			row := lifetimes[lk]
			if row == nil {
				row = &models.CorpBuildStatsRow{CorpRef: corpRef, TypeID: doc.TypeID}
				lifetimes[lk] = row
			}
			row.BrokersFeeTotal += f.Amount
			addCorpFeeToBreakdown(&row.Breakdown, seg, f)
			docTouched[lk] = struct{}{}

			bk := CorpBucketKey{CorpRef: corpRef, TypeID: doc.TypeID, Year: f.Year, Month: f.Month}
			b := buckets[bk]
			if b == nil {
				b = &models.CorpBuildStatsTimelineBucket{
					CorpRef: corpRef, TypeID: doc.TypeID, Year: f.Year, Month: f.Month,
				}
				buckets[bk] = b
			}
			b.BrokersFeeTotal += f.Amount
		}

		for lk := range docTouched {
			row := lifetimes[lk]
			row.TotalJobs++
			row.ItemBuildCount += doc.TotalProduced
			row.BuildCostTotal += doc.TotalBuildCosts
			row.JobCostTotal += (doc.TotalBuildCosts + doc.TotalInstallCost + doc.TotalExtras + doc.TotalInventionCost)
			addCorpBuildToBreakdown(&row.Breakdown, seg, doc)
		}

		// No sale/fee lines attributed to a corp, but linked industry jobs identify exactly one corporation
		// (production-chain intermediates, jobs never listed on market).
		if len(docTouched) == 0 && len(doc.LinkedIndustryCorpIDs) == 1 {
			corpID := doc.LinkedIndustryCorpIDs[0]
			if corpID > 0 {
				corpRef, refErr := hmacHelper.RefFromCorporationID(int64(corpID))
				if refErr == nil {
					lk := CorpLifetimeKey{CorpRef: corpRef, TypeID: doc.TypeID}
					row := lifetimes[lk]
					if row == nil {
						row = &models.CorpBuildStatsRow{CorpRef: corpRef, TypeID: doc.TypeID}
						lifetimes[lk] = row
					}
					row.TotalJobs++
					row.ItemBuildCount += doc.TotalProduced
					row.BuildCostTotal += doc.TotalBuildCosts
					row.JobCostTotal += (doc.TotalBuildCosts + doc.TotalInstallCost + doc.TotalExtras + doc.TotalInventionCost)
					addCorpBuildToBreakdown(&row.Breakdown, seg, doc)
				}
			}
		}
	}

	finalizeCorpLifetimeNetProfit(lifetimes)
	finalizeCorpTimelineBucketNetProfit(buckets)

	return lifetimes, buckets
}

func finalizeCorpLifetimeNetProfit(lifetimes map[CorpLifetimeKey]*models.CorpBuildStatsRow) {
	for _, row := range lifetimes {
		row.ProfitLoss = NetArchivedProfitLoss(
			row.SalesTotal, row.BrokersFeeTotal, row.TransactionFeeTotal, row.JobCostTotal)
		row.Breakdown.ProductionChain.ProfitLoss = NetArchivedProfitLossFromTotals(row.Breakdown.ProductionChain)
		row.Breakdown.RetainedStock.ProfitLoss = NetArchivedProfitLossFromTotals(row.Breakdown.RetainedStock)
		row.Breakdown.StandaloneRecordedSale.ProfitLoss = NetArchivedProfitLossFromTotals(row.Breakdown.StandaloneRecordedSale)
	}
}

// Timeline buckets do not carry allocated job cost per month; profit is sales − fees only for that bucket.
func finalizeCorpTimelineBucketNetProfit(buckets map[CorpBucketKey]*models.CorpBuildStatsTimelineBucket) {
	for _, b := range buckets {
		b.ProfitLoss = NetArchivedProfitLoss(b.SalesTotal, b.BrokersFeeTotal, b.TransactionFeeTotal, 0)
	}
}

func corpBreakdownSegmentPtr(bd *models.BuildStatsBreakdown, seg ArchivedJobStatsSegment) *models.BuildStatsSegmentTotals {
	switch seg {
	case SegmentProductionChain:
		return &bd.ProductionChain
	case SegmentRetainedStock:
		return &bd.RetainedStock
	default:
		return &bd.StandaloneRecordedSale
	}
}

func addCorpTransactionToBreakdown(bd *models.BuildStatsBreakdown, seg ArchivedJobStatsSegment, t models.ArchivedJobTransactionLine) {
	st := corpBreakdownSegmentPtr(bd, seg)
	st.TotalSoldQuantity += t.Quantity
	st.SalesTotal += t.Amount
	st.TransactionFeeTotal += t.Tax
}

func addCorpFeeToBreakdown(bd *models.BuildStatsBreakdown, seg ArchivedJobStatsSegment, f models.ArchivedJobFeeLine) {
	st := corpBreakdownSegmentPtr(bd, seg)
	st.BrokersFeeTotal += f.Amount
}

func addCorpBuildToBreakdown(bd *models.BuildStatsBreakdown, seg ArchivedJobStatsSegment, doc models.ArchivedJobStats) {
	st := corpBreakdownSegmentPtr(bd, seg)
	st.TotalJobs++
	st.ItemBuildCount += doc.TotalProduced
	st.BuildCostTotal += doc.TotalBuildCosts
	st.JobCostTotal += (doc.TotalBuildCosts + doc.TotalInstallCost + doc.TotalExtras + doc.TotalInventionCost)
}

// UniqueSortedCorpRefsFromMaps returns distinct non-empty corp refs referenced in AccumulateCorpBuildStats output.
func UniqueSortedCorpRefsFromMaps(
	lifetimes map[CorpLifetimeKey]*models.CorpBuildStatsRow,
	buckets map[CorpBucketKey]*models.CorpBuildStatsTimelineBucket,
) []string {
	refSet := map[string]struct{}{}
	for k := range lifetimes {
		if k.CorpRef != "" {
			refSet[k.CorpRef] = struct{}{}
		}
	}
	for k := range buckets {
		if k.CorpRef != "" {
			refSet[k.CorpRef] = struct{}{}
		}
	}
	out := make([]string, 0, len(refSet))
	for ref := range refSet {
		out = append(out, ref)
	}
	sort.Strings(out)
	return out
}

// CorpRefsFromArchivedJobStatsDocs aggregates docs and returns distinct corp refs (same derivation as corp_build_stats rows).
func CorpRefsFromArchivedJobStatsDocs(docs []models.ArchivedJobStats, keyring *corecrypto.Keyring, h *authzhmac.Helper) []string {
	lifetimes, buckets := AccumulateCorpBuildStats(docs, keyring, h)
	return UniqueSortedCorpRefsFromMaps(lifetimes, buckets)
}

// ArchivedJobStatsContributesToCorpBuildStats reports whether this snapshot would emit any corp_build_stats rows
// (same rules as AccumulateCorpBuildStats).
func ArchivedJobStatsContributesToCorpBuildStats(
	doc models.ArchivedJobStats,
	keyring *corecrypto.Keyring,
	hmacHelper *authzhmac.Helper,
) bool {
	lifetimes, _ := AccumulateCorpBuildStats([]models.ArchivedJobStats{doc}, keyring, hmacHelper)
	return len(lifetimes) > 0
}
