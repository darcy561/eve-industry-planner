package v1endpoints

import (
	"fmt"
	"net/http"
	"testing"
	"time"

	"eve-industry-planner/api/apideps"
	esicore "eve-industry-planner/shared/core/esi"
	eipredis "eve-industry-planner/shared/redis"
	"eve-industry-planner/testing/esifake"
	"eve-industry-planner/testing/natsfake"
	"eve-industry-planner/testing/redisfake"

	"github.com/nats-io/nats.go/jetstream"
)

// Rens, a station an account registers, in a region no default hub sits in.
const (
	savedStation = int64(60004588)
	savedRegion  = int32(10000030)
)

// savedStationHandler wires a handler that can resolve a station: ESI answers
// the universe chain, and NATS carries the work registration asks for.
func savedStationHandler(t *testing.T) (*Handlers, *eipredis.Redis, *esifake.Client) {
	t.Helper()
	handler, redis, esi, _ := savedStationHandlerWithStream(t)
	return handler, redis, esi
}

// savedStationHandlerWithStream also hands back the task stream, for a test that
// checks what the handler asked the worker to do.
func savedStationHandlerWithStream(t *testing.T) (*Handlers, *eipredis.Redis, *esifake.Client, jetstream.Stream) {
	t.Helper()

	redis := eipredis.NewRedis(redisfake.New(t).Client)
	esi := esifake.New(t)
	esi.SetJSON(http.MethodGet, fmt.Sprintf("/universe/stations/%d/", savedStation),
		http.StatusOK, `{"system_id":30002510}`)
	esi.SetJSON(http.MethodGet, "/universe/systems/30002510/",
		http.StatusOK, `{"constellation_id":20000371}`)
	esi.SetJSON(http.MethodGet, "/universe/constellations/20000371/",
		http.StatusOK, fmt.Sprintf(`{"region_id":%d}`, savedRegion))

	nats := natsfake.New(t)
	stream, err := nats.NATS.Tasks.Ensure(t.Context())
	if err != nil {
		t.Fatalf("ensure task stream: %v", err)
	}

	return New(&apideps.Deps{Redis: redis, ESI: esi, NATS: nats.NATS}), redis, esi, stream
}

// register puts a market where registration would leave it: its region resolved
// and remembered, and the station in the set a derive pass prices. The read
// under test asks ESI nothing, so the resolution has to have happened already.
func register(t *testing.T, redis *eipredis.Redis, esi *esifake.Client, stationID int64) {
	t.Helper()

	if _, err := esicore.RegionOfStation(t.Context(), esi, redis, stationID); err != nil {
		t.Fatalf("resolve station %d: %v", stationID, err)
	}
	if err := redis.MarketOrders().TrackStation(t.Context(), savedRegion, stationID, time.Now()); err != nil {
		t.Fatalf("track station: %v", err)
	}
}

// A registered market's prices are answered under the id the caller asked with,
// carrying the clock of the region its book was walked in.
func TestARegisteredStationsPricesAreAnsweredUnderItsID(t *testing.T) {
	handler, redis, esi := savedStationHandler(t)
	register(t, redis, esi, savedStation)
	seedPrice(t, redis, 34, savedStation, 5, 6)
	if err := redis.MarketOrders().PutRefreshTime(t.Context(), savedRegion, time.UnixMilli(1_757_000_000_000)); err != nil {
		t.Fatalf("seed refresh time: %v", err)
	}

	_, got := query(t, handler, MarketPricesQueryBody{
		Sources: map[string][]string{fmt.Sprint(savedStation): {"34"}},
	})

	source := got.Sources[fmt.Sprint(savedStation)]
	if source.Prices["34"].Buy != 5 {
		t.Errorf("answered %+v, want the seeded buy price 5", source.Prices["34"])
	}
	if source.RefreshedAt != 1_757_000_000_000 {
		t.Errorf("refreshedAt = %d, want the region's walk clock", source.RefreshedAt)
	}
}

// Reading prices registers nothing. A market this server has not been told about
// is refused rather than registered on the way past: an account says what it
// prices against when it signs in and when it saves a market, and a read that
// registered would put a region into the sweep for a page nobody had saved.
func TestReadingPricesRegistersNothing(t *testing.T) {
	handler, redis, esi, stream := savedStationHandlerWithStream(t)

	rec, _ := query(t, handler, MarketPricesQueryBody{
		Sources: map[string][]string{fmt.Sprint(savedStation): {"34"}},
	})
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status %d, want 400 for a market nothing registered", rec.Code)
	}

	regions, err := redis.MarketOrders().TrackedRegions(t.Context())
	if err != nil {
		t.Fatalf("tracked regions: %v", err)
	}
	if len(regions) != 0 {
		t.Errorf("reading prices tracked %v", regions)
	}
	if asked := tasksAsked(t, stream); len(asked) != 0 {
		t.Errorf("reading prices published %v", asked)
	}
	_ = esi
}

// An id that is no market at all is refused the same way, so a caller cannot
// tell this server to resolve arbitrary ids by asking for prices.
func TestAnIDThatIsNoMarketIsRefused(t *testing.T) {
	handler, _, _ := savedStationHandler(t)

	for _, id := range []string{"not-a-market", "34", "1035466617946"} {
		rec, _ := query(t, handler, MarketPricesQueryBody{Sources: map[string][]string{id: {"34"}}})
		if rec.Code != http.StatusBadRequest {
			t.Errorf("source %q answered %d, want 400", id, rec.Code)
		}
	}
}

// tasksAsked reads the tasks a handler published off the stream, so what it
// asked the worker to do is checked at the publish rather than inferred.
func tasksAsked(t *testing.T, stream jetstream.Stream) []string {
	t.Helper()

	info, err := stream.Info(t.Context())
	if err != nil {
		t.Fatalf("stream info: %v", err)
	}

	subjects := []string{}
	for seq := uint64(1); seq <= info.State.LastSeq; seq++ {
		msg, err := stream.GetMsg(t.Context(), seq)
		if err != nil {
			continue
		}
		subjects = append(subjects, msg.Subject)
	}
	return subjects
}
