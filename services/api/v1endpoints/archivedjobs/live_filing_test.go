package archivedjobs

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"eve-industry-planner/api/helper/auth"
	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"
	"eve-industry-planner/shared/statistics"
	"eve-industry-planner/testing/mongolive"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// Filing writes to the job and lets the rebuild carry it, so what has to hold is
// that the reduction reads the job back the same way afterwards.
// Requires EIP_MONGO_PARITY_LIVE=1.

const filingScratchAccount = "eip-parity-filing-account"

func filingRequestFor(t *testing.T, path, body string) *http.Request {
	t.Helper()
	r := httptest.NewRequest(http.MethodPatch, path, strings.NewReader(body))
	return r.WithContext(auth.WithAuthIdentity(r.Context(), filingScratchAccount, "sess-filing"))
}

// A job with one hand-entered sale: its months are the user's to choose, which
// is the case filing exists for.
func handEnteredJob(jobID string, soldOn time.Time) models.Job {
	job := models.Job{JobID: jobID, ItemID: 34, JobType: 1, ItemsProducedPerRun: 10}
	job.Build.Setup = map[string]models.JobSetup{"s1": {ID: "s1", RunCount: 1, JobCount: 1}}
	job.Build.Sale.Transactions = []models.Transaction{{
		TransactionID: -1700000000000,
		Quantity:      10,
		Amount:        5000,
		Date:          soldOn.Format(time.RFC3339),
	}}
	job.MetaData.Owner.ID = filingScratchAccount
	job.MetaData.ArchivedAt = soldOn
	return job
}

func fileMonths(t *testing.T, h *Handlers, jobID, body string) (int, string) {
	t.Helper()
	return filePath(t, h, "/api/v1/archived-jobs/"+jobID+"/filing", body)
}

func filePath(t *testing.T, h *Handlers, path, body string) (int, string) {
	t.Helper()
	rec := httptest.NewRecorder()
	h.Router(rec, filingRequestFor(t, path, body))
	return rec.Code, rec.Body.String()
}

// The row is what the aggregates are folded from, so the test asserts on the row
// the reduction produces rather than on the response.
func rowFor(t *testing.T, ctx context.Context, mongo *eipmongo.Mongo, jobID string) models.ArchivedJobStats {
	t.Helper()
	job, err := mongo.ArchivedJobs.LoadJobByID(ctx, filingScratchAccount, jobID)
	if err != nil {
		t.Fatalf("reload archived job: %v", err)
	}
	row, err := statistics.NewRow(job, time.Now().UTC())
	if err != nil {
		t.Fatalf("reduce archived job: %v", err)
	}
	return row
}

func TestLive_filingMovesBothSidesOfAHandEnteredJob(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	mongolive.ScratchAccount(t, mongo, filingScratchAccount)

	h := restoreHandlers(t, mongo)
	soldOn := time.Date(2026, 8, 10, 0, 0, 0, 0, time.UTC)
	archiveJobFor(t, ctx, h, handEnteredJob("job-filing-1", soldOn), filingScratchAccount, soldOn)

	code, body := fileMonths(t, h, "job-filing-1", `{"costMonth":"2026-03","salesMonth":"2026-04"}`)
	if code != http.StatusOK {
		t.Fatalf("filing = %d: %s", code, body)
	}

	row := rowFor(t, ctx, mongo, "job-filing-1")
	if row.CostMonth != (models.CalendarMonth{Year: 2026, Month: 3}) {
		t.Fatalf("cost month is %+v, want 2026-03", row.CostMonth)
	}
	if len(row.TransactionLines) != 1 ||
		row.TransactionLines[0].CalendarMonth != (models.CalendarMonth{Year: 2026, Month: 4}) {
		t.Fatalf("sale line month is %+v, want 2026-04", row.TransactionLines)
	}
	if !row.MonthsFiled {
		t.Fatal("a filed row has to say so, or a month that disagrees with the dates reads as a fault")
	}
	// The queued work is a rebuild: a delta cannot move figures between buckets.
	var entry struct {
		Work string `bson:"work"`
	}
	if err := mongo.StatisticsRebuildQueue.Collection().FindOne(ctx,
		bson.M{"_id": models.AccountOwner(filingScratchAccount).Key()}).Decode(&entry); err != nil {
		t.Fatalf("no work queued: %v", err)
	}
	if entry.Work != string(eipmongo.StatsWorkRebuild) {
		t.Fatalf("queued %q, want a rebuild", entry.Work)
	}
}

// Money the market recorded arrived when it arrived.
func TestLive_filingRefusesToMoveMarketSales(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	mongolive.ScratchAccount(t, mongo, filingScratchAccount)

	h := restoreHandlers(t, mongo)
	soldOn := time.Date(2026, 8, 10, 0, 0, 0, 0, time.UTC)
	job := handEnteredJob("job-filing-2", soldOn)
	// A positive id is ESI's own.
	job.Build.Sale.Transactions[0].TransactionID = 6000000001
	archiveJobFor(t, ctx, h, job, filingScratchAccount, soldOn)

	code, _ := fileMonths(t, h, "job-filing-2", `{"salesMonth":"2026-04"}`)
	if code != http.StatusConflict {
		t.Fatalf("filing market sales = %d, want 409", code)
	}
	if row := rowFor(t, ctx, mongo, "job-filing-2"); row.TransactionLines[0].CalendarMonth.Month != 8 {
		t.Fatalf("a refused filing moved the sale anyway: %+v", row.TransactionLines[0])
	}

	// The cost side of the same job is still the user's to choose.
	if code, body := fileMonths(t, h, "job-filing-2", `{"costMonth":"2026-02"}`); code != http.StatusOK {
		t.Fatalf("filing costs on a market job = %d: %s", code, body)
	}
	if row := rowFor(t, ctx, mongo, "job-filing-2"); row.CostMonth.Month != 2 {
		t.Fatalf("cost month is %+v, want 2026-02", row.CostMonth)
	}
}

func TestLive_filingIsUndoneByClearingIt(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	mongolive.ScratchAccount(t, mongo, filingScratchAccount)

	h := restoreHandlers(t, mongo)
	soldOn := time.Date(2026, 8, 10, 0, 0, 0, 0, time.UTC)
	archiveJobFor(t, ctx, h, handEnteredJob("job-filing-3", soldOn), filingScratchAccount, soldOn)

	if code, body := fileMonths(t, h, "job-filing-3", `{"costMonth":"2026-01"}`); code != http.StatusOK {
		t.Fatalf("filing = %d: %s", code, body)
	}
	if code, body := fileMonths(t, h, "job-filing-3", `{"costMonth":null}`); code != http.StatusOK {
		t.Fatalf("clearing = %d: %s", code, body)
	}

	row := rowFor(t, ctx, mongo, "job-filing-3")
	// Back to what the job's own evidence says: the sale it holds.
	if row.CostMonth != (models.CalendarMonth{Year: 2026, Month: 8}) {
		t.Fatalf("cleared cost month is %+v, want the derived 2026-08", row.CostMonth)
	}
	if row.MonthsFiled {
		t.Fatal("nothing is filed any more, so the row must not claim to be")
	}
}

func TestLive_filingRefusesAMonthThatHasNotHappened(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	mongolive.ScratchAccount(t, mongo, filingScratchAccount)

	h := restoreHandlers(t, mongo)
	soldOn := time.Now().UTC()
	archiveJobFor(t, ctx, h, handEnteredJob("job-filing-4", soldOn), filingScratchAccount, soldOn)

	next := time.Now().UTC().AddDate(0, 2, 0).Format("2006-01")
	if code, _ := fileMonths(t, h, "job-filing-4", `{"costMonth":"`+next+`"}`); code != http.StatusBadRequest {
		t.Fatalf("filing a future month = %d, want 400", code)
	}
	if code, _ := fileMonths(t, h, "job-filing-4", `{"costMonth":"2026-13"}`); code != http.StatusBadRequest {
		t.Fatalf("filing a month that is not one = %d, want 400", code)
	}
}

// Filing a group files its members together: the point of the bulk form is that
// a set archived as one is corrected as one.
func TestLive_filingAGroupMovesEveryMember(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	mongolive.ScratchAccount(t, mongo, filingScratchAccount)

	h := restoreHandlers(t, mongo)
	soldOn := time.Date(2026, 8, 10, 0, 0, 0, 0, time.UTC)
	for _, jobID := range []string{"job-group-a", "job-group-b"} {
		job := handEnteredJob(jobID, soldOn)
		job.GroupID = "group-filing"
		job.IncludedInGroup = true
		archiveJobFor(t, ctx, h, job, filingScratchAccount, soldOn)
	}

	code, body := filePath(t, h,
		"/api/v1/archived-jobs/groups/group-filing/filing", `{"costMonth":"2026-02"}`)
	if code != http.StatusOK {
		t.Fatalf("filing a group = %d: %s", code, body)
	}

	for _, jobID := range []string{"job-group-a", "job-group-b"} {
		if row := rowFor(t, ctx, mongo, jobID); row.CostMonth.Month != 2 {
			t.Fatalf("%s is filed under %+v, want 2026-02", jobID, row.CostMonth)
		}
	}
}

// A set can hold both kinds. Refusing the whole request over one market sale
// would make bulk filing useless, so the ones that can move do, and the answer
// says how many did not.
func TestLive_filingAGroupLeavesMarketSalesWhereTheyAre(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	mongolive.ScratchAccount(t, mongo, filingScratchAccount)

	h := restoreHandlers(t, mongo)
	soldOn := time.Date(2026, 8, 10, 0, 0, 0, 0, time.UTC)

	hand := handEnteredJob("job-mixed-hand", soldOn)
	hand.GroupID, hand.IncludedInGroup = "group-mixed", true
	archiveJobFor(t, ctx, h, hand, filingScratchAccount, soldOn)

	market := handEnteredJob("job-mixed-market", soldOn)
	market.GroupID, market.IncludedInGroup = "group-mixed", true
	market.Build.Sale.Transactions[0].TransactionID = 6000000002
	archiveJobFor(t, ctx, h, market, filingScratchAccount, soldOn)

	code, body := filePath(t, h,
		"/api/v1/archived-jobs/groups/group-mixed/filing",
		`{"costMonth":"2026-02","salesMonth":"2026-03"}`)
	if code != http.StatusOK {
		t.Fatalf("filing a mixed group = %d: %s", code, body)
	}
	if !strings.Contains(body, `"salesLockedByMarket":1`) {
		t.Fatalf("the answer does not say what it left alone: %s", body)
	}

	if row := rowFor(t, ctx, mongo, "job-mixed-hand"); row.TransactionLines[0].CalendarMonth.Month != 3 {
		t.Fatalf("a hand-entered sale did not move: %+v", row.TransactionLines[0])
	}
	if row := rowFor(t, ctx, mongo, "job-mixed-market"); row.TransactionLines[0].CalendarMonth.Month != 8 {
		t.Fatalf("a market sale moved: %+v", row.TransactionLines[0])
	}
	// Costs are nobody's evidence, so both sides of the set move.
	if row := rowFor(t, ctx, mongo, "job-mixed-market"); row.CostMonth.Month != 2 {
		t.Fatalf("the market job's costs did not move: %+v", row.CostMonth)
	}
}
