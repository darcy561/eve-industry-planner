package v1endpoints

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"

	"eve-industry-planner/api/apideps"
	esitypes "eve-industry-planner/shared/core/esi/types"
	"eve-industry-planner/testing/redisfake"

	eipredis "eve-industry-planner/shared/redis"
)

const (
	jitaRegion  = 10000002
	amarrRegion = 10000043
)

func queryHandler(t *testing.T) (*Handlers, *eipredis.Redis) {
	t.Helper()
	redis := eipredis.NewRedis(redisfake.New(t).Client)
	return New(&apideps.Deps{Redis: redis}), redis
}

func query(t *testing.T, h *Handlers, body MarketPricesQueryBody) (*httptest.ResponseRecorder, MarketPricesQueryResponse) {
	t.Helper()
	encoded, err := json.Marshal(body)
	if err != nil {
		t.Fatalf("encode the request: %v", err)
	}
	rec := httptest.NewRecorder()
	h.MarketPricesQueryHandler(rec, httptest.NewRequest(
		http.MethodPost, "/api/v1/market-prices/query", bytes.NewReader(encoded)))

	var got MarketPricesQueryResponse
	if rec.Code == http.StatusOK {
		if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
			t.Fatalf("decode the response: %v (body %s)", err, rec.Body.String())
		}
	}
	return rec, got
}

func seedPrice(t *testing.T, redis *eipredis.Redis, typeID, regionID int32, buy, sell float64) {
	t.Helper()
	err := redis.MarketOrders().PutPrice(context.Background(), typeID, regionID, eipredis.MarketPriceEntry{
		Buy: buy, Sell: sell, BuyP95: buy, SellP05: sell, LastUpdated: 1757000000000,
	})
	if err != nil {
		t.Fatalf("seed a price: %v", err)
	}
}

// The caller names the markets it wants, so a surface pricing against one market
// carries one market's figures rather than four and a choice.
func TestMarketPricesQueryAnswersOnlyTheSourcesAsked(t *testing.T) {
	h, redis := queryHandler(t)
	seedPrice(t, redis, 34, jitaRegion, 5, 6)
	seedPrice(t, redis, 34, amarrRegion, 7, 8)

	_, got := query(t, h, MarketPricesQueryBody{Sources: map[string][]string{"jita": {"34"}}})

	if len(got.Sources) != 1 {
		t.Fatalf("got %d sources, want 1: %+v", len(got.Sources), got.Sources)
	}
	if price := got.Sources["jita"].Prices["34"]; price.Buy != 5 || price.Sell != 6 {
		t.Errorf("jita 34 = %+v, want buy 5 sell 6", price)
	}
}

// A market holding no order for a type says nothing about it, rather than
// reporting a price of zero — which is a figure, and a wrong one.
func TestMarketPricesQueryOmitsATypeAMarketHasNoOrderFor(t *testing.T) {
	h, redis := queryHandler(t)
	seedPrice(t, redis, 34, jitaRegion, 5, 6)

	_, got := query(t, h, MarketPricesQueryBody{
		Sources: map[string][]string{"jita": {"34", "35"}},
	})

	if _, held := got.Sources["jita"].Prices["35"]; held {
		t.Errorf("35 was answered for: %+v", got.Sources["jita"].Prices)
	}
	if _, held := got.Sources["jita"].Prices["34"]; !held {
		t.Error("34 was not answered for")
	}
}

// Each source carries the moment its region was walked, which is what lets a
// browser tell a row it already holds from one a walk has replaced.
func TestMarketPricesQueryCarriesEachSourcesClock(t *testing.T) {
	h, redis := queryHandler(t)
	walked := time.UnixMilli(1757000000000).UTC()
	if err := redis.MarketOrders().PutRefreshTime(context.Background(), jitaRegion, walked); err != nil {
		t.Fatalf("record the walk: %v", err)
	}
	seedPrice(t, redis, 34, jitaRegion, 5, 6)

	_, got := query(t, h, MarketPricesQueryBody{Sources: map[string][]string{"jita": {"34"}}})

	if got.Sources["jita"].RefreshedAt != walked.UnixMilli() {
		t.Errorf("refreshedAt = %d, want %d", got.Sources["jita"].RefreshedAt, walked.UnixMilli())
	}
}

// A source the server does not price is a client-side mistake — a reader-saved
// market is the browser's to fetch — so it is refused rather than answered
// empty, which would read as a market with no orders.
func TestMarketPricesQueryRefusesASourceTheServerDoesNotPrice(t *testing.T) {
	h, _ := queryHandler(t)

	rec, _ := query(t, h, MarketPricesQueryBody{
		Sources: map[string][]string{"jita": {"34"}, "some-citadel": {"34"}},
	})

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
}

func TestMarketPricesQueryRefusesARequestAskingForNothing(t *testing.T) {
	h, _ := queryHandler(t)

	rec, _ := query(t, h, MarketPricesQueryBody{})

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
}

// Each market carries the types wanted at it, so a caller pricing some materials
// at one market and some at another is not asking for every type at both. One
// shared list would fetch and return the rows nothing reads.
func TestMarketPricesQueryAsksEachSourceOnlyForItsOwnTypes(t *testing.T) {
	h, redis := queryHandler(t)
	seedPrice(t, redis, 34, jitaRegion, 5, 6)
	seedPrice(t, redis, 35, jitaRegion, 1, 2)
	seedPrice(t, redis, 35, amarrRegion, 7, 8)

	_, got := query(t, h, MarketPricesQueryBody{
		Sources: map[string][]string{"jita": {"34"}, "amarr": {"35"}},
	})

	if _, held := got.Sources["jita"].Prices["35"]; held {
		t.Errorf("jita answered for 35, which was wanted at amarr: %+v", got.Sources["jita"].Prices)
	}
	if _, held := got.Sources["jita"].Prices["34"]; !held {
		t.Error("jita did not answer for 34")
	}
	if _, held := got.Sources["amarr"].Prices["35"]; !held {
		t.Error("amarr did not answer for 35")
	}
}

// A market that resolved none of its caller's types asks for nothing, which is
// not a mistake — every type it would have covered was priced somewhere else.
func TestMarketPricesQuerySkipsASourceWantingNoTypes(t *testing.T) {
	h, redis := queryHandler(t)
	seedPrice(t, redis, 34, jitaRegion, 5, 6)

	rec, got := query(t, h, MarketPricesQueryBody{
		Sources: map[string][]string{"jita": {"34"}, "amarr": {}},
	})

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if _, answered := got.Sources["amarr"]; answered {
		t.Errorf("amarr was answered for though nothing was wanted there: %+v", got.Sources)
	}
}

// The adjusted price is source-independent and refreshes daily, so it is its own
// block with its own clock and is only sent when asked for.
func TestMarketPricesQuerySendsAdjustedPricesOnlyWhenAsked(t *testing.T) {
	h, redis := queryHandler(t)
	seedPrice(t, redis, 34, jitaRegion, 5, 6)
	err := redis.Cache(eipredis.DatasetMarketPrices).PutEntry(context.Background(), int32(34),
		esitypes.AdjustedPrice{TypeID: 34, AdjustedPrice: 4.9, LastUpdated: 1756900000000})
	if err != nil {
		t.Fatalf("seed an adjusted price: %v", err)
	}

	_, without := query(t, h, MarketPricesQueryBody{Sources: map[string][]string{"jita": {"34"}}})
	if without.Adjusted != nil {
		t.Errorf("adjusted prices were sent unasked: %+v", without.Adjusted)
	}

	_, with := query(t, h, MarketPricesQueryBody{
		Sources: map[string][]string{"jita": {"34"}}, AdjustedTypeIDs: []string{"34"},
	})
	if with.Adjusted == nil {
		t.Fatal("adjusted prices were asked for and not sent")
	}
	if with.Adjusted.Prices["34"] != 4.9 {
		t.Errorf("adjusted 34 = %v, want 4.9", with.Adjusted.Prices["34"])
	}
	if with.Adjusted.RefreshedAt != 1756900000000 {
		t.Errorf("adjusted clock = %d, want 1756900000000", with.Adjusted.RefreshedAt)
	}
}

// Adjusted prices belong to no market, so a caller wanting only those names none
// and is still answered.
func TestMarketPricesQueryAnswersAdjustedPricesWithNoSource(t *testing.T) {
	h, redis := queryHandler(t)
	err := redis.Cache(eipredis.DatasetMarketPrices).PutEntry(context.Background(), int32(34),
		esitypes.AdjustedPrice{TypeID: 34, AdjustedPrice: 4.9, LastUpdated: 1756900000000})
	if err != nil {
		t.Fatalf("seed an adjusted price: %v", err)
	}

	rec, got := query(t, h, MarketPricesQueryBody{AdjustedTypeIDs: []string{"34"}})

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if got.Adjusted == nil || got.Adjusted.Prices["34"] != 4.9 {
		t.Errorf("adjusted = %+v, want 34 at 4.9", got.Adjusted)
	}
}

// The cap counts the reads a request asks for, not the type ids it names: the
// same type at two markets is two reads, so counting ids would let a request
// through that asks for twice the work.
func TestMarketPricesQueryCountsOneTypeAtTwoMarketsTwice(t *testing.T) {
	h, _ := queryHandler(t)

	typeIDs := make([]string, 0, 300)
	for id := 34; id < 334; id++ {
		typeIDs = append(typeIDs, strconv.Itoa(id))
	}

	rec, _ := query(t, h, MarketPricesQueryBody{
		Sources: map[string][]string{"jita": typeIDs, "amarr": typeIDs},
	})

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400 for 600 reads", rec.Code)
	}
}

func TestMarketPricesQueryRefusesAnythingButPost(t *testing.T) {
	h, _ := queryHandler(t)

	rec := httptest.NewRecorder()
	h.MarketPricesQueryHandler(rec, httptest.NewRequest(http.MethodGet, "/api/v1/market-prices/query", nil))

	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status = %d, want 405", rec.Code)
	}
}
