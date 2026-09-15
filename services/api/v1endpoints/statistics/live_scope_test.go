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
	"eve-industry-planner/shared/models"
	"eve-industry-planner/shared/models/planner"
	eipmongo "eve-industry-planner/shared/mongo"
	sessionreq "eve-industry-planner/shared/plannersession/request"
	"eve-industry-planner/testing/mongolive"

	"go.mongodb.org/mongo-driver/v2/bson"
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
	return r.WithContext(sessionreq.WithIdentity(r.Context(), accountID, "sess-scope"))
}

// seedFigures gives an account one month and one lifetime row, with the money
// distinctive enough that a leak is unmistakable in a diff.
func seedFigures(t *testing.T, ctx context.Context, mongo *eipmongo.Mongo, accountID string, amount float64) {
	t.Helper()
	month := models.TimelineMonthBucket{
		ID:               accountID + "|34|2026-08",
		Owner:            models.AccountOwner(accountID),
		TypeID:           34,
		Year:             2026,
		Month:            8,
		SalesTotal:       amount,
		JobCostTotal:     amount / 2,
		ProfitLoss:       amount / 2,
		ContributingRows: 1,
	}
	if _, err := mongo.StatisticsTimeline.UpsertStructPreservingMeta(ctx, month, month.ID); err != nil {
		t.Fatalf("seed month for %s: %v", accountID, err)
	}

	totals := models.ProductionTotalsRow{
		ID:         accountID + "|34",
		Owner:      models.AccountOwner(accountID),
		TypeID:     34,
		TotalJobs:  1,
		SalesTotal: amount,
	}
	if _, err := mongo.StatisticsTotals.UpsertStructPreservingMeta(ctx, totals, totals.ID); err != nil {
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

// A shared planner is reached by holding a membership row for it, not by owning
// the figures. Without the row the same request is refused, so the row is the
// whole of what separates the two answers. Requires EIP_MONGO_PARITY_LIVE=1.
func TestLive_aSharedPlannerIsReachedByItsMembers(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()

	const sharedPlannerID = "planner:01HZY6R3QK7T9V2M4N8P0XW5AD"
	sharedOwner := models.Owner{Kind: models.OwnerPlanner, ID: "01HZY6R3QK7T9V2M4N8P0XW5AD"}
	memberRow := planner.MembershipID(sharedPlannerID, mineAccount)

	mongolive.ScratchAccount(t, mongo, mineAccount)
	t.Cleanup(func() {
		cleanupCtx, cancelCleanup := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancelCleanup()
		_, _ = mongo.PlannerMemberships.Collection().DeleteMany(cleanupCtx, bson.M{"plannerID": sharedPlannerID})
		_, _ = mongo.StatisticsTotals.Collection().DeleteMany(cleanupCtx,
			bson.M{eipmongo.FieldMetaOwnerKind: models.OwnerPlanner, eipmongo.FieldMetaOwnerID: sharedOwner.ID})
	})

	// Figures owned by the planner rather than by either account, written from the
	// model so the stored shape is the one the read decodes.
	totals := models.ProductionTotalsRow{
		ID:         eipmongo.ProductionTotalsDocumentID(sharedOwner, 34),
		Owner:      sharedOwner,
		TypeID:     34,
		TotalJobs:  1,
		SalesTotal: 123456.0,
	}
	if _, err := mongo.StatisticsTotals.UpsertStructPreservingMeta(ctx, totals, totals.ID); err != nil {
		t.Fatalf("seed planner figures: %v", err)
	}

	h := scopeHandlers(mongo)
	path := "/api/v1/statistics/" + sharedPlannerID + "/totals?typeID=34"

	// No membership row: the planner is unreachable however its figures are owned.
	if code, _ := readBody(t, h, asAccount(t, mineAccount, path)); code != http.StatusForbidden {
		t.Fatalf("without a membership row = %d, want 403", code)
	}

	if _, err := mongo.PlannerMemberships.Collection().InsertOne(ctx, bson.M{
		"_id":           memberRow,
		"schemaVersion": planner.MembershipSchemaCurrent,
		"plannerID":     sharedPlannerID,
		"accountID":     mineAccount,
		"joinedAt":      time.Now().UTC(),
		"joinMethod":    bson.M{"invite": bson.M{"invitedBy": theirsAccount, "issuedAt": time.Now().UTC()}},
	}); err != nil {
		t.Fatalf("join the shared planner: %v", err)
	}

	code, body := readBody(t, h, asAccount(t, mineAccount, path))
	if code != http.StatusOK {
		t.Fatalf("with a membership row = %d, want 200 (body %s)", code, body)
	}
	if !strings.Contains(body, "123456") {
		t.Fatalf("a member read the planner but not its figures: %s", body)
	}

	// Leaving refuses the next request rather than the next login: the row is read
	// at the authorisation point, not cached onto the session.
	if _, err := mongo.PlannerMemberships.Collection().DeleteOne(ctx, bson.M{"_id": memberRow}); err != nil {
		t.Fatalf("leave the shared planner: %v", err)
	}
	if code, _ := readBody(t, h, asAccount(t, mineAccount, path)); code != http.StatusForbidden {
		t.Fatalf("after leaving = %d, want 403 on the very next request", code)
	}
}

// An account reaches its own figures because the backfill and login give it a
// membership row for its own planner — the same mechanism, not a special case.
func TestLive_anAccountReachesItselfThroughItsOwnMembership(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	mongolive.ScratchAccount(t, mongo, mineAccount)

	if err := mongo.EnsureAccountPlanner(ctx, mineAccount, time.Now().UTC()); err != nil {
		t.Fatalf("create the account planner: %v", err)
	}
	t.Cleanup(func() {
		cleanupCtx, cancelCleanup := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancelCleanup()
		_, _ = mongo.Planners.Collection().DeleteMany(cleanupCtx, bson.M{"_id": models.AccountOwner(mineAccount).Key()})
		_, _ = mongo.PlannerMemberships.Collection().DeleteMany(cleanupCtx, bson.M{"accountID": mineAccount})
	})

	granted, err := mongo.OwnerKeysForAccount(ctx, mineAccount)
	if err != nil {
		t.Fatalf("OwnerKeysForAccount: %v", err)
	}
	if !granted.Has(models.AccountOwner(mineAccount)) {
		t.Fatalf("granted = %v, want the account's own planner", granted)
	}

	seedFigures(t, ctx, mongo, mineAccount, 4242.0)
	h := scopeHandlers(mongo)
	code, body := readBody(t, h, asAccount(t, mineAccount,
		"/api/v1/statistics/account:"+mineAccount+"/totals?typeID=34"))
	if code != http.StatusOK {
		t.Fatalf("own figures = %d, want 200 (body %s)", code, body)
	}
	if !strings.Contains(body, "4242") {
		t.Fatalf("own figures missing from %s", body)
	}
}
