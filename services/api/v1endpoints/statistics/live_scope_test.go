package statistics

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"eve-industry-planner/api/apideps"
	"eve-industry-planner/api/helper/auth"
	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"
	"eve-industry-planner/testing/mongolive"
)

// Every statistics query carries the account, so a caller asking for another
// owner should read nothing rather than be refused after the fact. That is an
// argument about the code until two accounts hold figures at once and the bytes
// coming back are checked. Requires EIP_MONGO_PARITY_LIVE=1.

const (
	mineAccount   = "eip-parity-scope-mine"
	theirsAccount = "eip-parity-scope-theirs"
)

func scopeHandlers(mongo *eipmongo.Mongo) *Handlers {
	return New(&apideps.Deps{Mongo: mongo})
}

// request as the private mux delivers one: a session, and a path naming an owner.
func asAccount(t *testing.T, accountID, path string) *http.Request {
	t.Helper()
	r := httptest.NewRequest(http.MethodGet, path, nil)
	return r.WithContext(auth.WithAuthIdentity(r.Context(), accountID, "sess-scope"))
}

// seedFigures gives an account one month and one lifetime row, with the money
// distinctive enough that a leak is unmistakable in a diff.
func seedFigures(t *testing.T, ctx context.Context, mongo *eipmongo.Mongo, accountID string, amount float64) {
	t.Helper()
	month := models.TimelineMonthBucket{
		ID:     accountID + "|34|2026-08",
		Owner:  models.AccountOwner(accountID),
		TypeID: 34,
		Year:   2026,
		Month:  8,
	}
	month.SalesTotal = amount
	month.JobCostTotal = amount / 2
	month.ProfitLoss = amount / 2
	month.ContributingRows = 1
	if _, err := mongo.AccountTimelineMonths.UpsertStructPreservingMeta(ctx, month, month.ID); err != nil {
		t.Fatalf("seed month for %s: %v", accountID, err)
	}

	totals := models.ProductionTotalsRow{
		ID:     accountID + "|34",
		Owner:  models.AccountOwner(accountID),
		TypeID: 34,
	}
	totals.TotalJobs = 1
	totals.SalesTotal = amount
	if _, err := mongo.ProductionTotals.UpsertStructPreservingMeta(ctx, totals, totals.ID); err != nil {
		t.Fatalf("seed totals for %s: %v", accountID, err)
	}
}

func readBody(t *testing.T, h *Handlers, r *http.Request) (int, string) {
	t.Helper()
	rec := httptest.NewRecorder()
	h.Router(rec, r)
	return rec.Code, rec.Body.String()
}

func TestLive_aViewReturnsOnlyTheSessionsOwnFigures(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	mongolive.ScratchAccount(t, mongo, mineAccount)
	mongolive.ScratchAccount(t, mongo, theirsAccount)

	const mineAmount, theirsAmount = 111.0, 999999.0
	seedFigures(t, ctx, mongo, mineAccount, mineAmount)
	seedFigures(t, ctx, mongo, theirsAccount, theirsAmount)

	h := scopeHandlers(mongo)
	for _, view := range []string{"timeline", "timeline/items", "totals?typeID=34"} {
		t.Run(view, func(t *testing.T) {
			code, body := readBody(t, h, asAccount(t, mineAccount,
				"/api/v1/statistics/account:"+mineAccount+"/"+view))
			if code != http.StatusOK {
				t.Fatalf("%s = %d, want 200: %s", view, code, body)
			}
			if !strings.Contains(body, "111") {
				t.Fatalf("%s returned none of the caller's own figures: %s", view, body)
			}
			// The other account's money is the tell: it can only be here if the
			// query read past the owner.
			if strings.Contains(body, "999999") {
				t.Fatalf("%s leaked another account's figures: %s", view, body)
			}
		})
	}
}

// The path names an owner, so the obvious attempt is to name someone else's
// while holding a valid session of one's own.
func TestLive_namingAnotherOwnerReadsNothing(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	mongolive.ScratchAccount(t, mongo, mineAccount)
	mongolive.ScratchAccount(t, mongo, theirsAccount)

	seedFigures(t, ctx, mongo, theirsAccount, 999999.0)

	h := scopeHandlers(mongo)
	for _, view := range []string{"timeline", "timeline/items", "totals?typeID=34"} {
		t.Run(view, func(t *testing.T) {
			code, body := readBody(t, h, asAccount(t, mineAccount,
				"/api/v1/statistics/account:"+theirsAccount+"/"+view))
			if code != http.StatusForbidden {
				t.Fatalf("%s = %d, want 403", view, code)
			}
			if strings.Contains(body, "999999") {
				t.Fatalf("%s refused the request and answered with the figures anyway: %s", view, body)
			}
		})
	}
}

// A window is a filter, not a boundary: widening it must not reach past the
// owner, and the widest window the API offers is the one to prove it on.
func TestLive_theWidestWindowIsStillOneOwnersData(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	mongolive.ScratchAccount(t, mongo, mineAccount)
	mongolive.ScratchAccount(t, mongo, theirsAccount)

	seedFigures(t, ctx, mongo, mineAccount, 111.0)
	seedFigures(t, ctx, mongo, theirsAccount, 999999.0)

	h := scopeHandlers(mongo)
	for _, query := range []string{"?range=all", "?from=2000-01&to=2026-12", "?typeID=34&includeProductionChain=true"} {
		t.Run(query, func(t *testing.T) {
			code, body := readBody(t, h, asAccount(t, mineAccount,
				"/api/v1/statistics/account:"+mineAccount+"/timeline"+query))
			if code != http.StatusOK && code != http.StatusBadRequest {
				t.Fatalf("%s = %d: %s", query, code, body)
			}
			if strings.Contains(body, "999999") {
				t.Fatalf("timeline%s leaked another account's figures: %s", query, body)
			}
		})
	}
}

// A request the parser refuses must fail rather than fall back to a wider read:
// a rejected range that silently became "everything" would answer with figures
// the caller never asked for.
func TestLive_arefusedParameterReturnsNoFigures(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	mongolive.ScratchAccount(t, mongo, mineAccount)

	seedFigures(t, ctx, mongo, mineAccount, 111.0)

	h := scopeHandlers(mongo)
	for _, query := range []string{
		"?from=2026-01",                      // half a range
		"?from=2026-13&to=2026-14",           // not months
		"?from=2026-08&to=2026-01",           // reversed
		"?from=1990-01&to=2026-12",           // longer than the maximum
		"?range=all&from=2026-01&to=2026-02", // both ways of naming a window
		"?typeID=-1",
	} {
		t.Run(query, func(t *testing.T) {
			code, body := readBody(t, h, asAccount(t, mineAccount,
				"/api/v1/statistics/account:"+mineAccount+"/timeline"+query))
			if code != http.StatusBadRequest {
				t.Fatalf("timeline%s = %d, want 400: %s", query, code, body)
			}
			var decoded map[string]any
			if err := json.Unmarshal([]byte(body), &decoded); err == nil {
				if _, hasMonths := decoded["months"]; hasMonths {
					t.Fatalf("timeline%s answered with figures as well as an error: %s", query, body)
				}
			}
		})
	}
}
