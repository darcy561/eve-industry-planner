package archivedjobs

import (
	"context"
	"errors"
	"net/http"

	"eve-industry-planner/api/helper"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/models"
	"eve-industry-planner/shared/statistics"
	"eve-industry-planner/shared/telemetry/apimetrics"
)

// listEntry is one archived job as a list row draws it.
type listEntry struct {
	JobID      string `json:"jobID"`
	Name       string `json:"name"`
	TypeID     int    `json:"typeID"`
	JobType    int    `json:"jobType"`
	ArchivedAt string `json:"archivedAt"`

	// GroupID is the container it was archived from; RelatedSetID the dependency
	// graph it belongs to. Either may be empty, and they are independent.
	GroupID      string `json:"groupID,omitempty"`
	RelatedSetID string `json:"relatedSetID,omitempty"`

	// Measures is absent, not zeroed, when the job has no statistics row.
	Measures *listMeasures `json:"measures,omitempty"`

	// AwaitingTotals says this job's figures are not in the account's aggregates
	// yet. The measures beside it are still correct: they are the job's own, and
	// are written when it is archived. Sent only when true.
	AwaitingTotals bool `json:"awaitingTotals,omitempty"`

	// FiguresStale says the last rebuild could not read this job, so its measures
	// are the last ones that could be computed rather than what it is worth now.
	// Sent only when true.
	FiguresStale bool `json:"figuresStale,omitempty"`

	// MonthsFiled says the user chose which months this job's figures count in,
	// so a row whose dates and months disagree reads as a choice. Sent only when
	// true.
	MonthsFiled bool `json:"monthsFiled,omitempty"`

	// CostMonth is where this job's costs currently count, filed or derived, so a
	// dialogue offering to change it can show what it is changing from.
	CostMonth string `json:"costMonth,omitempty"`

	// SalesMonth is where this job's income currently counts, so the dialogue
	// opens on it rather than on nothing. It is the earliest of the sale lines:
	// filing moves them together, so one month can stand for them.
	SalesMonth string `json:"salesMonth,omitempty"`

	// SalesFromMarket says ESI recorded at least one of the sales, which is what
	// makes the income side unmovable.
	SalesFromMarket bool `json:"salesFromMarket,omitempty"`
}

// listMeasures is what a row reports about a job's money.
type listMeasures struct {
	ItemsProduced float64 `json:"itemsProduced"`
	JobCostTotal  float64 `json:"jobCostTotal"`
	SalesTotal    float64 `json:"salesTotal"`
	ProfitLoss    float64 `json:"profitLoss"`
	Segment       string  `json:"segment"`
}

type listPaging struct {
	Sort   string `json:"sort"`
	Order  string `json:"order"`
	Limit  int    `json:"limit"`
	Offset int    `json:"offset"`
	// TotalJobs is every job matched, not the page length.
	TotalJobs int `json:"totalJobs"`
}

// listFilters echoes the filters applied.
type listFilters struct {
	From    string `json:"from,omitempty"`
	To      string `json:"to,omitempty"`
	TypeID  int    `json:"typeID,omitempty"`
	GroupID string `json:"groupID,omitempty"`
	Search  string `json:"search,omitempty"`
}

type listResponse struct {
	Filters listFilters `json:"filters"`
	Paging  listPaging  `json:"paging"`
	Jobs    []listEntry `json:"jobs"`
}

// GetArchivedJobsHandler handles GET /api/v1/archived-jobs (paged summaries).
func (h *Handlers) GetArchivedJobsHandler(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	m := apimetrics.GetAPIArchivedJobs()
	metrics := helper.BeginRequestMetrics(ctx, helper.RequestMetricsHooks{
		ObserveDuration: func(ctx context.Context, ms float64) { m.Requests.Observe(ctx, ms) },
		IncRequests:     func(ctx context.Context) { m.RequestsCount.Inc(ctx) },
		IncSuccesses:    func(ctx context.Context) { m.Successes.Inc(ctx) },
		IncErrors:       func(ctx context.Context, reason string) { m.Errors.WithLabelValues(reason).Inc(ctx) },
	})
	defer metrics.Finish()

	accountID := helper.AuthenticatedAccountID(r)

	if h.Mongo == nil {
		metrics.Error("mongo_client_missing")
		helper.RespondEndpointError(w, r, http.StatusServiceUnavailable, "Service unavailable", "archived jobs list: mongo client missing", "archived_jobs_mongo_unavailable", "archived_jobs_list", errors.New("mongo client missing"), nil)
		return
	}

	scope, err := accountArchiveScope(h.Mongo, accountID)
	if err != nil {
		metrics.Error("scope_unavailable")
		helper.RespondEndpointServerError(w, r, "Failed to retrieve archived jobs", "archived jobs list: archive scope unavailable", "archived_jobs_list_scope_unavailable", "archived_jobs_list", err, nil)
		return
	}

	query, err := resolveListQuery(r, scope)
	if err != nil {
		helper.RespondParamError(w, r, metrics, "archived_jobs_list", err)
		return
	}
	paging, err := helper.ResolvePaging(r, listPagingRules)
	if err != nil {
		helper.RespondParamError(w, r, metrics, "archived_jobs_list", err)
		return
	}

	page, err := listArchivedJobs(ctx, query, paging.Sort, paging.Ascending, paging.Limit, paging.Offset)
	if err != nil {
		metrics.Error("database_error")
		helper.RespondEndpointServerError(w, r, "Failed to retrieve archived jobs", "archived jobs list: query failed", "archived_jobs_list_query_failed", "archived_jobs_list", err, nil)
		return
	}

	jobIDs := make([]string, 0, len(page.Jobs))
	for _, job := range page.Jobs {
		jobIDs = append(jobIDs, job.JobID)
	}
	stats, err := loadArchivedJobStatsByJobIDs(ctx, scope, jobIDs)
	if err != nil {
		metrics.Error("database_error")
		helper.RespondEndpointServerError(w, r, "Failed to retrieve archived jobs", "archived jobs list: statistics read failed", "archived_jobs_list_stats_failed", "archived_jobs_list", err, nil)
		return
	}

	relatedSets := relatedSetIDs(page.Jobs)

	jobs := make([]listEntry, 0, len(page.Jobs))
	for _, job := range page.Jobs {
		entry := listEntry{
			JobID:        job.JobID,
			Name:         job.Name,
			TypeID:       job.ItemID,
			JobType:      job.JobType,
			GroupID:      job.GroupID,
			RelatedSetID: relatedSets[job.JobID],
		}
		if !job.ArchivedAt.IsZero() {
			entry.ArchivedAt = job.ArchivedAt.UTC().Format(archivedAtFormat)
		}
		if row, ok := stats[job.JobID]; ok {
			entry.Measures = measuresFromStats(row)
			entry.AwaitingTotals = row.AwaitsContribution()
			entry.FiguresStale = row.FiguresAreStale()
			entry.MonthsFiled = row.MonthsFiled
			if row.CostMonth.Year > 0 {
				entry.CostMonth = row.CostMonth.String()
			}
			entry.SalesMonth = earliestSaleMonth(row)
			entry.SalesFromMarket = salesFromMarket(row)
		}
		jobs = append(jobs, entry)
	}

	sortField := paging.Sort
	if sortField == "" {
		// Echo the ordering applied, so a client can page without restating it.
		sortField = DefaultArchivedJobSort
	}

	resp := listResponse{
		Filters: listFilters{
			TypeID:  query.TypeID,
			GroupID: query.GroupID,
			Search:  query.Search,
		},
		Paging: listPaging{
			Sort:      sortField,
			Order:     paging.Order(),
			Limit:     paging.Limit,
			Offset:    paging.Offset,
			TotalJobs: page.TotalJobs,
		},
		Jobs: jobs,
	}
	if !query.From.IsZero() {
		resp.Filters.From = query.From.String()
	}
	if !query.To.IsZero() {
		resp.Filters.To = query.To.String()
	}

	w.WriteHeader(http.StatusOK)
	if err := helper.EncodeJSON(w, resp); err != nil {
		metrics.Error("encode_error")
		helper.RespondEndpointServerError(w, r, "Internal server error", "archived jobs list: encode failed", "archived_jobs_list_encode_failed", "archived_jobs_list", err, nil)
		return
	}
	metrics.Success()
	logs.AttachHandlerSuccessDetail(r, "archived jobs listed", map[string]any{
		"jobs":       len(jobs),
		"total_jobs": page.TotalJobs,
		"sort":       sortField,
	})
}

// archivedAtFormat is the wire form for an archive timestamp.
const archivedAtFormat = "2006-01-02T15:04:05Z"

// measuresFromStats reduces a statistics row through statistics.JobMeasures,
// the same reduction the totals are folded from.
func measuresFromStats(row models.ArchivedJobStats) *listMeasures {
	measures := statistics.JobMeasures(row)
	return &listMeasures{
		ItemsProduced: measures.ItemBuildCount,
		JobCostTotal:  measures.JobCostTotal,
		SalesTotal:    measures.SalesTotal,
		ProfitLoss:    measures.ProfitLoss,
		Segment:       statistics.JobSegment(row),
	}
}

// salesFromMarket reports whether any of a row's sale lines came from ESI. The
// rule is models.IsMarketTransactionID; this is the reduced row's shape of the
// same question models.Job.SalesAreFromMarket asks of the job.
func salesFromMarket(row models.ArchivedJobStats) bool {
	for _, line := range row.TransactionLines {
		if models.IsMarketTransactionID(line.TransactionID) {
			return true
		}
	}
	return false
}

// earliestSaleMonth is the first month this job's income counts in, as YYYY-MM,
// or empty when it has no sales.
func earliestSaleMonth(row models.ArchivedJobStats) string {
	var earliest models.CalendarMonth
	for _, line := range row.TransactionLines {
		if earliest.Year == 0 || line.CalendarMonth.Before(earliest) {
			earliest = line.CalendarMonth
		}
	}
	if earliest.Year == 0 {
		return ""
	}
	return earliest.String()
}
