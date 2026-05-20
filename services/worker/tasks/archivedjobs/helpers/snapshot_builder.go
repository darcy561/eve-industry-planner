package helpers

import (
	"sort"
	"strings"
	"time"

	"eve-industry-planner/shared/core/jobid/corpinference"
	mongocore "eve-industry-planner/shared/core/mongo"
	"eve-industry-planner/shared/core/sealedfields/entityids"
	"eve-industry-planner/shared/models"
)

type orderIdentityMeta struct {
	isCorp bool
	corpID int
}

func parseLineDate(raw string, fallback time.Time) time.Time {
	if raw == "" {
		return fallback.UTC()
	}
	if t, err := time.Parse(time.RFC3339, raw); err == nil {
		return t.UTC()
	}
	if t, err := time.Parse("2006-01-02 15:04:05", raw); err == nil {
		return t.UTC()
	}
	return fallback.UTC()
}

func corpStatusFor(isCorp bool, corpID int) string {
	if !isCorp {
		return "personal"
	}
	if corpID > 0 {
		return "corp_known"
	}
	return "corp_unknown"
}

// distinctLinkedIndustryCorpIDs returns sorted unique positive corporation_id values from linked ESI industry jobs.
// Matches corpinference.InferJobCorp's notion of corp-bearing rows (corporation_id > 0).
func distinctLinkedIndustryCorpIDs(linked []models.LinkedESIJob) []int {
	if len(linked) == 0 {
		return nil
	}
	seen := make(map[int]struct{}, len(linked))
	for _, lj := range linked {
		if lj.CorporationID > 0 {
			seen[lj.CorporationID] = struct{}{}
		}
	}
	if len(seen) == 0 {
		return nil
	}
	out := make([]int, 0, len(seen))
	for id := range seen {
		out = append(out, id)
	}
	sort.Ints(out)
	return out
}

func extraCategoryTotals(extras []models.ExtraCost) map[string]float64 {
	if len(extras) == 0 {
		return nil
	}
	out := map[string]float64{}
	for _, e := range extras {
		id := strings.TrimSpace(e.Category)
		if id == "" {
			id = "0"
		}
		out[id] += e.ExtraValue
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

func earliestInstallMonth(linked []models.LinkedESIJob, fallback time.Time) (int, int) {
	fallback = fallback.UTC()
	earliest := fallback
	found := false
	for _, lj := range linked {
		candidates := []string{lj.StartDate, lj.EndDate, lj.CompletedDate}
		for _, raw := range candidates {
			if raw == "" {
				continue
			}
			t := parseLineDate(raw, fallback)
			if !found || t.Before(earliest) {
				earliest = t
				found = true
			}
		}
	}
	return earliest.Year(), int(earliest.Month())
}

func earliestTransactionMonth(transactions []models.Transaction, fallback time.Time) (int, int) {
	fallback = fallback.UTC()
	earliest := fallback
	found := false
	for _, t := range transactions {
		if t.Date == "" {
			continue
		}
		td := parseLineDate(t.Date, fallback)
		if !found || td.Before(earliest) {
			earliest = td
			found = true
		}
	}
	return earliest.Year(), int(earliest.Month())
}

func buildArchivedJobStatsDocument(job models.Job, snap models.BuildStatSnapshot) models.ArchivedJobStats {
	now := time.Now().UTC()
	archivedAt := job.MetaData.ArchivedAt
	if archivedAt.IsZero() {
		archivedAt = now
	}

	totalProduced := snap.TotalProduced
	totalCost := snap.TotalJobCost
	costPerItem := 0.0
	if totalProduced > 0 {
		costPerItem = totalCost / totalProduced
	}

	orderIdentity := map[int]orderIdentityMeta{}
	for _, o := range job.Build.Sale.MarketOrders {
		orderIdentity[o.OrderID] = orderIdentityMeta{isCorp: o.IsCorporation, corpID: o.CorporationID}
	}

	inferredCorpID, inferredStat := corpinference.InferJobCorp(job.Build.Costs.LinkedJobs)
	applyInferredCorp := inferredStat == corpinference.StatusKnown && inferredCorpID > 0

	transactionLines := make([]models.ArchivedJobTransactionLine, 0, len(job.Build.Sale.Transactions))
	soldQty := 0.0
	for _, t := range job.Build.Sale.Transactions {
		lineDate := parseLineDate(t.Date, archivedAt)
		qty := float64(t.Quantity)
		soldQty += qty
		isCorp := t.IsCorp
		corpID := t.CorporationID
		if corpID <= 0 && t.OrderID != 0 {
			if linkedOrder, ok := orderIdentity[t.OrderID]; ok {
				isCorp = isCorp || linkedOrder.isCorp
				corpID = linkedOrder.corpID
			}
		}
		if applyInferredCorp && corpID <= 0 {
			corpID = inferredCorpID
			isCorp = true
		}
		corpStatus := corpStatusFor(isCorp, corpID)
		resolvedCorpID := 0
		if corpStatus == "corp_known" && corpID > 0 {
			resolvedCorpID = corpID
		}
		proratedCost := qty * costPerItem
		transactionLines = append(transactionLines, models.ArchivedJobTransactionLine{
			TransactionID:  t.TransactionID,
			OrderID:        t.OrderID,
			Date:           lineDate,
			Year:           lineDate.Year(),
			Month:          int(lineDate.Month()),
			Quantity:       qty,
			Amount:         t.Amount,
			Tax:            t.Tax,
			ProratedCost:   proratedCost,
			Profit:         t.Amount - t.Tax - proratedCost,
			IsCorp:         isCorp,
			CorpStatus:     corpStatus,
			ResolvedCorpID: resolvedCorpID,
		})
	}

	feeLines := make([]models.ArchivedJobFeeLine, 0, len(job.Build.Sale.BrokersFee))
	for _, f := range job.Build.Sale.BrokersFee {
		lineDate := parseLineDate(f.Date, archivedAt)
		meta := orderIdentityMeta{}
		if linkedOrder, ok := orderIdentity[f.OrderID]; ok {
			meta = linkedOrder
		}
		if applyInferredCorp && meta.corpID <= 0 {
			meta.corpID = inferredCorpID
			meta.isCorp = true
		}
		corpStatus := corpStatusFor(meta.isCorp, meta.corpID)
		resolvedFeeCorp := 0
		if corpStatus == "corp_known" && meta.corpID > 0 {
			resolvedFeeCorp = meta.corpID
		}
		feeLines = append(feeLines, models.ArchivedJobFeeLine{
			FeeID:          f.ID,
			OrderID:        f.OrderID,
			Date:           lineDate,
			Year:           lineDate.Year(),
			Month:          int(lineDate.Month()),
			Amount:         f.Amount,
			IsCorp:         meta.isCorp,
			CorpStatus:     corpStatus,
			ResolvedCorpID: resolvedFeeCorp,
		})
	}

	unsoldQty := totalProduced - soldQty
	if unsoldQty < 0 {
		unsoldQty = 0
	}
	unsoldCost := unsoldQty * costPerItem

	// Before entityids.Strip: shallow copy shares LinkedJobs slice memory with stripped job; Strip may clear it.
	linkedIndustryCorpIDs := distinctLinkedIndustryCorpIDs(job.Build.Costs.LinkedJobs)
	costYear, costMonth := earliestInstallMonth(job.Build.Costs.LinkedJobs, archivedAt)
	if len(job.Build.Costs.LinkedJobs) == 0 {
		costYear, costMonth = earliestTransactionMonth(job.Build.Sale.Transactions, archivedAt)
	}
	extrasByCategory := extraCategoryTotals(job.Build.Costs.ExtrasCosts)

	stripped := job
	entityids.Strip(&stripped)

	return models.ArchivedJobStats{
		JobID:                 job.JobID,
		TypeID:                job.ItemID,
		JobType:               job.JobType,
		IsProductionChain:     len(job.ParentJobs) > 0,
		RetainedStockBuild:    job.MetaData.RetainedStockBuild,
		ArchivedAt:            archivedAt,
		CostYear:              costYear,
		CostMonth:             costMonth,
		TotalProduced:         snap.TotalProduced,
		TotalMaterialCost:     snap.TotalMaterialCost,
		TotalInstallCost:      snap.TotalInstallCost,
		TotalExtras:           snap.TotalExtras,
		TotalInventionCost:    snap.TotalInventionCost,
		TotalBuildCosts:       snap.TotalBuildCosts,
		TotalCostPerItem:      snap.TotalCostPerItem,
		ExtraCategoryTotals:   extrasByCategory,
		UnsoldQuantity:        unsoldQty,
		UnsoldCost:            unsoldCost,
		LinkedIndustryCorpIDs: linkedIndustryCorpIDs,
		TransactionLines:      transactionLines,
		FeeLines:              feeLines,
		Sealed:                stripped.Sealed,
		ProcessedAt:           now,
		Revoked:               false,
		Version:               0,
	}
}

// BuildArchivedJobStatsSnapshot builds a snapshot for user archivedJobs (Firebase account–scoped).
// Rows carry accountID; UpsertArchivedJobStatsSnapshot may place the doc in corp_archived_job_stats or
// user_archived_job_stats depending on whether the job contributes to corporation build stats.
func BuildArchivedJobStatsSnapshot(job models.Job, snap models.BuildStatSnapshot) (models.ArchivedJobStats, error) {
	doc := buildArchivedJobStatsDocument(job, snap)
	accountID := job.MetaData.AccountID
	doc.ID = mongocore.ArchivedJobStatsDocumentID(accountID, job.JobID)
	doc.AccountID = accountID
	return doc, nil
}

// BuildCorpArchivedJobStatsSnapshot builds a corp_archived_job_stats row for jobs in corp_archivedJobs
// (_id = corpRef|jobID). These snapshots are corporation-scoped only: do not set accountID; they feed
// corporation aggregates (corp_build_stats), not personal build_stats / user_build_stats.
func BuildCorpArchivedJobStatsSnapshot(job models.Job, snap models.BuildStatSnapshot, corpRef string) (models.ArchivedJobStats, error) {
	doc := buildArchivedJobStatsDocument(job, snap)
	doc.ID = mongocore.CorpOwnedArchivedJobStatsDocumentID(corpRef, job.JobID)
	doc.CorpRef = corpRef
	return doc, nil
}
