package archivedjobs

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"time"

	"eve-industry-planner/api/helper"
	"eve-industry-planner/shared/archivestats"
	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"
	"eve-industry-planner/shared/telemetry/apimetrics"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// filingRequest names the months a job's two sides count in. A field omitted is
// left as it was; a field sent as null returns that side to what the reduction
// derives, which is how a filing is undone.
type filingRequest struct {
	CostMonth  json.RawMessage `json:"costMonth"`
	SalesMonth json.RawMessage `json:"salesMonth"`
}

type filingResponse struct {
	JobIDs     []string             `json:"jobIDs"`
	CostMonth  models.CalendarMonth `json:"costMonth,omitzero"`
	SalesMonth models.CalendarMonth `json:"salesMonth,omitzero"`
	// SalesLockedByMarket counts the jobs in the selection whose income ESI
	// recorded, so the caller can say what it left alone rather than implying it
	// moved everything.
	SalesLockedByMarket int `json:"salesLockedByMarket,omitempty"`
}

// FileArchivedJobMonthsHandler serves the three filing routes: one job, a group,
// or a related set.
//
// Income ESI recorded is filed by the market. A single job naming it is refused;
// a set files what it can and reports how many it left alone, since refusing a
// group over one market sale would make bulk filing useless.
//
// The months go on the jobs, never on their statistics rows: a row is rebuilt
// from its job. The rebuild queued here is the ordinary one, because a delta can
// add or remove a row's figures but not move them between buckets.
func (h *Handlers) FileArchivedJobMonthsHandler(w http.ResponseWriter, r *http.Request, selection archiveSelection, id string) {
	ctx := r.Context()
	m := apimetrics.GetAPIArchivedJobs()
	metrics := helper.BeginRequestMetrics(ctx, helper.RequestMetricsHooks{
		ObserveDuration: func(ctx context.Context, ms float64) { m.Requests.Observe(ctx, ms) },
		IncRequests:     func(ctx context.Context) { m.RequestsCount.Inc(ctx) },
		IncSuccesses:    func(ctx context.Context) { m.Successes.Inc(ctx) },
		IncErrors:       func(ctx context.Context, reason string) { m.Errors.WithLabelValues(reason).Inc(ctx) },
	})
	defer metrics.Finish()

	accountID, ok := helper.RequireAccountID(w, r)
	if !ok {
		metrics.Error("unauthorized")
		return
	}
	if h.Mongo == nil {
		metrics.Error("mongo_client_missing")
		helper.RespondEndpointError(w, r, http.StatusServiceUnavailable, "Service unavailable", "file months: mongo client missing", "archived_jobs_mongo_unavailable", "archived_jobs_filing", errors.New("mongo client missing"), nil)
		return
	}

	var req filingRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		metrics.Error("bad_request")
		helper.RespondEndpointError(w, r, http.StatusBadRequest, "Invalid body", "file months: body unreadable", "archived_jobs_filing_body", "archived_jobs_filing", err, nil)
		return
	}

	scope, err := accountArchiveScope(h.Mongo, accountID)
	if err != nil {
		metrics.Error("scope")
		helper.RespondEndpointError(w, r, http.StatusInternalServerError, "Server error", "file months: archive scope", "archived_jobs_filing_scope", "archived_jobs_filing", err, nil)
		return
	}

	jobs, _, err := selectArchivedJobs(ctx, scope, selection, id)
	if err != nil {
		metrics.Error("load")
		helper.RespondEndpointError(w, r, http.StatusInternalServerError, "Server error", "file months: load archived jobs", "archived_jobs_filing_load", "archived_jobs_filing", err, nil)
		return
	}
	if len(jobs) == 0 {
		metrics.Error("not_found")
		helper.RespondEndpointError(w, r, http.StatusNotFound, "Not found", "file months: nothing to file", "not_found", "archived_jobs_filing", nil, map[string]any{"id": id})
		return
	}

	now := time.Now().UTC()
	// The months are read against the first job so an omitted field means "leave
	// it as it is" for a single job; a set is filed as one, so the same month is
	// applied to every member.
	costMonth, err := readFiledMonth(req.CostMonth, jobs[0].FiledCostMonth, now)
	if err != nil {
		helper.RespondParamError(w, r, metrics, "archived_jobs_filing", fmt.Errorf("costMonth: %w", err))
		return
	}
	salesMonth, err := readFiledMonth(req.SalesMonth, jobs[0].FiledSalesMonth, now)
	if err != nil {
		helper.RespondParamError(w, r, metrics, "archived_jobs_filing", fmt.Errorf("salesMonth: %w", err))
		return
	}
	if selection == selectionJob && salesMonth.Valid() && jobs[0].SalesAreFromMarket() {
		metrics.Error("sales_from_market")
		helper.RespondEndpointError(w, r, http.StatusConflict, "This job's sales came from the market, so their months cannot be changed",
			"file months: sales are market recorded", "archived_jobs_filing_market", "archived_jobs_filing", nil,
			map[string]any{"jobID": id})
		return
	}

	out := filingResponse{JobIDs: make([]string, 0, len(jobs))}
	rows := make([]models.ArchivedJobStats, 0, len(jobs))
	for i := range jobs {
		job := &jobs[i]
		jobSales := salesMonth
		if jobSales.Valid() && job.SalesAreFromMarket() {
			jobSales = nil
			out.SalesLockedByMarket++
		}

		job.FiledCostMonth, job.FiledSalesMonth = costMonth, jobSales
		if err := writeFiledMonths(ctx, scope, job.JobID, costMonth, jobSales); err != nil {
			metrics.Error("write")
			helper.RespondEndpointError(w, r, http.StatusInternalServerError, "Server error", "file months: write job", "archived_jobs_filing_write", "archived_jobs_filing", err, nil)
			return
		}
		out.JobIDs = append(out.JobIDs, job.JobID)

		// The rows are rewritten here so the archive list agrees at once; the
		// rebuild below is what moves the aggregates.
		row, rowErr := archivestats.NewAccountRow(*job, now)
		if rowErr != nil {
			continue
		}
		row.ID = eipmongo.ArchivedJobStatsDocumentID(accountID, job.JobID)
		row.AccountID = accountID
		rows = append(rows, row)
	}

	if len(rows) > 0 {
		if err := h.Mongo.WriteStatsRows(ctx, rows, len(rows)); err != nil {
			metrics.Error("write_row")
			helper.RespondEndpointError(w, r, http.StatusInternalServerError, "Server error", "file months: write statistics rows", "archived_jobs_filing_row", "archived_jobs_filing", err, nil)
			return
		}
	}

	if err := h.Mongo.QueueOwnerWork(ctx, models.AccountStatsOwner(accountID), eipmongo.StatsWorkRebuild, now); err != nil {
		metrics.Error("queue")
		helper.RespondEndpointError(w, r, http.StatusInternalServerError, "Server error", "file months: queue rebuild", "archived_jobs_filing_queue", "archived_jobs_filing", err, nil)
		return
	}

	if costMonth.Valid() {
		out.CostMonth = *costMonth
	}
	if salesMonth.Valid() {
		out.SalesMonth = *salesMonth
	}
	if err := helper.EncodeJSON(w, out); err != nil {
		metrics.Error("encode")
		return
	}
	metrics.Success()
}

// readFiledMonth reads one field of the request: absent leaves the month as it
// was, null clears it, and a value replaces it.
func readFiledMonth(raw json.RawMessage, current *models.CalendarMonth, now time.Time) (*models.CalendarMonth, error) {
	if len(raw) == 0 {
		return current, nil
	}
	if string(raw) == "null" {
		return nil, nil
	}

	var wire string
	if err := json.Unmarshal(raw, &wire); err != nil {
		return nil, fmt.Errorf("must be a YYYY-MM string or null")
	}
	key, err := eipmongo.ParseMonthKey(wire)
	if err != nil {
		return nil, err
	}
	month := models.CalendarMonth{Year: key.Year, Month: key.Month}
	// A month that has not happened cannot hold work that has.
	if eipmongo.CurrentMonth(now).Before(eipmongo.MonthKey{Year: month.Year, Month: month.Month}) {
		return nil, fmt.Errorf("%s has not happened yet", wire)
	}
	return &month, nil
}

// writeFiledMonths sets or clears the two fields on the archived job document.
func writeFiledMonths(ctx context.Context, scope archiveScope, jobID string, cost, sales *models.CalendarMonth) error {
	coll, err := scope.jobsCollection()
	if err != nil {
		return err
	}
	filter := scope.filter()
	filter["jobID"] = jobID

	set, unset := bson.M{}, bson.M{}
	for field, month := range map[string]*models.CalendarMonth{"filedCostMonth": cost, "filedSalesMonth": sales} {
		if month.Valid() {
			set[field] = bson.M{"year": month.Year, "month": month.Month}
			continue
		}
		unset[field] = ""
	}

	update := bson.M{}
	if len(set) > 0 {
		update["$set"] = set
	}
	if len(unset) > 0 {
		update["$unset"] = unset
	}
	return eipmongo.Retry(ctx, "file archived job months", func() error {
		_, uerr := coll.UpdateOne(ctx, filter, update)
		return uerr
	})
}
