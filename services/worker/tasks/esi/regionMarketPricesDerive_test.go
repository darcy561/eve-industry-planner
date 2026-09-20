package esi_test

import (
	"context"
	"strconv"
	"strings"
	"testing"
	"time"

	objectstore "eve-industry-planner/shared/core/objectstore"
	"eve-industry-planner/shared/esiclient"
	eipnats "eve-industry-planner/shared/nats"
	eipredis "eve-industry-planner/shared/redis"
	"eve-industry-planner/testing/natsfake"
	"eve-industry-planner/testing/redisfake"
	"eve-industry-planner/worker/taskrun"
	esi "eve-industry-planner/worker/tasks/esi"

	"github.com/nats-io/nats.go/jetstream"
)

// The book the test origin serves spreads its orders across three stations, which
// is what makes "one walk, several stations priced" a real claim rather than the
// single-station walk wearing a new name.
const (
	testRegion   = int32(10000002)
	firstStation = int64(60003760)
	nextStation  = int64(60003761)
)

// marketTaskDeps wires a walk and a derive against an embedded stack: a fake
// Redis, an in-process page store and an embedded NATS the walk publishes its
// derive request to.
func marketTaskDeps(t *testing.T, origin *ordersOrigin) (*taskrun.Dependencies, *redisfake.Redis) {
	t.Helper()

	fake := redisfake.New(t)
	cfg := esiclient.DefaultConfig()
	cfg.BaseURL = origin.server.URL
	api, stop, err := esiclient.New(eipredis.NewRedis(fake.Client), cfg)
	if err != nil {
		t.Fatalf("esiclient: %v", err)
	}
	t.Cleanup(stop)

	nats := natsfake.New(t)
	if _, err := nats.NATS.Tasks.Ensure(t.Context()); err != nil {
		t.Fatalf("ensure task stream: %v", err)
	}

	return &taskrun.Dependencies{
		Redis:       eipredis.NewRedis(fake.Client),
		ESI:         api,
		NATS:        nats.NATS,
		MarketPages: objectstore.NewMarketPages(objectstore.NewMemoryBackend()),
	}, fake
}

func track(t *testing.T, deps *taskrun.Dependencies, stationID int64) {
	t.Helper()
	if err := deps.Redis.MarketOrders().TrackStation(context.Background(), testRegion, stationID, time.Now()); err != nil {
		t.Fatalf("track station %d: %v", stationID, err)
	}
}

func walkRegion(t *testing.T, deps *taskrun.Dependencies) {
	t.Helper()
	if err := esi.RefreshRegionMarketOrders(t.Context(), eipnats.RegionMarketOrdersRequest{RegionID: testRegion}, deps); err != nil {
		t.Fatalf("walk: %v", err)
	}
}

func derive(t *testing.T, deps *taskrun.Dependencies) {
	t.Helper()
	if err := esi.DeriveRegionMarketPrices(t.Context(), eipnats.RegionMarketPricesRequest{RegionID: testRegion}, deps); err != nil {
		t.Fatalf("derive: %v", err)
	}
}

// pricedTypes reports how many type entries are stored for one station.
func pricedTypes(t *testing.T, fake *redisfake.Redis, stationID int64) int {
	t.Helper()

	suffix := ":" + strconv.FormatInt(stationID, 10)
	count := 0
	for _, key := range fake.Server.Keys() {
		if strings.HasPrefix(key, "esi:market_orders:") && strings.HasSuffix(key, suffix) {
			count++
		}
	}
	return count
}

// One walk prices every station tracked in the region, which is the whole point
// of splitting the two: the orders were read once.
func TestOneWalkPricesEveryTrackedStation(t *testing.T) {
	origin := newOrdersOrigin(t, 2, 20)
	deps, fake := marketTaskDeps(t, origin)

	track(t, deps, firstStation)
	track(t, deps, nextStation)
	walkRegion(t, deps)
	derive(t, deps)

	for _, stationID := range []int64{firstStation, nextStation} {
		if got := pricedTypes(t, fake, stationID); got == 0 {
			t.Errorf("station %d was priced for no types", stationID)
		}
	}
}

// A station saved in a region something else already walks is priced from the
// pages that walk stored, and costs no ESI call at all.
func TestASecondStationInATrackedRegionCostsNoESICall(t *testing.T) {
	origin := newOrdersOrigin(t, 2, 20)
	deps, fake := marketTaskDeps(t, origin)

	track(t, deps, firstStation)
	walkRegion(t, deps)
	derive(t, deps)

	walked := origin.requests.Load()

	track(t, deps, nextStation)
	derive(t, deps)

	if got := origin.requests.Load(); got != walked {
		t.Errorf("pricing a second station cost %d ESI requests, want none", got-walked)
	}
	if got := pricedTypes(t, fake, nextStation); got == 0 {
		t.Error("the second station was priced for no types")
	}
}

// Nothing is priced ahead of being asked for: a region walked with no station
// tracked in it stores its pages and writes no price.
func TestAWalkPricesNothingUntilAStationIsTracked(t *testing.T) {
	origin := newOrdersOrigin(t, 1, 10)
	deps, fake := marketTaskDeps(t, origin)

	walkRegion(t, deps)
	derive(t, deps)

	if got := pricedTypes(t, fake, firstStation); got != 0 {
		t.Errorf("an untracked station was priced for %d types", got)
	}
}

// A deployment with no page store has nothing to derive from, so the walk prices
// the stations it is streaming instead. Without that, every book would be walked
// and nothing priced.
func TestAWalkWithNoPageStorePricesWhatItStreams(t *testing.T) {
	origin := newOrdersOrigin(t, 2, 20)
	deps, fake := marketTaskDeps(t, origin)
	deps.MarketPages = nil

	track(t, deps, firstStation)
	walkRegion(t, deps)

	if got := pricedTypes(t, fake, firstStation); got == 0 {
		t.Error("a walk with no page store priced nothing")
	}
}

// taskDeps is a worker's dependencies plus a way to read what a task published,
// for the tasks whose work is asking for other work.
type taskDeps struct {
	deps   *taskrun.Dependencies
	stream jetstream.Stream
}

func newTaskDeps(t *testing.T, api esiclient.API) *taskDeps {
	t.Helper()

	nats := natsfake.New(t)
	stream, err := nats.NATS.Tasks.Ensure(t.Context())
	if err != nil {
		t.Fatalf("ensure task stream: %v", err)
	}

	return &taskDeps{
		deps: &taskrun.Dependencies{
			Redis:       eipredis.NewRedis(redisfake.New(t).Client),
			ESI:         api,
			NATS:        nats.NATS,
			MarketPages: objectstore.NewMarketPages(objectstore.NewMemoryBackend()),
		},
		stream: stream,
	}
}

// published names the subjects a task asked for.
func (d *taskDeps) published(t *testing.T) []string {
	t.Helper()

	info, err := d.stream.Info(t.Context())
	if err != nil {
		t.Fatalf("stream info: %v", err)
	}

	subjects := []string{}
	for seq := uint64(1); seq <= info.State.LastSeq; seq++ {
		msg, err := d.stream.GetMsg(t.Context(), seq)
		if err != nil {
			continue
		}
		subjects = append(subjects, msg.Subject)
	}
	return subjects
}

// A book that shrinks leaves trailing pages behind, and a derive reads every
// page a region holds — so a page the book no longer has would go on being
// folded into that region's prices for as long as the object survived, and
// nothing would ever refresh or remove it.
func TestAShrunkBookStopsBeingPricedFrom(t *testing.T) {
	origin := newOrdersOrigin(t, 3, 20)
	deps, fake := marketTaskDeps(t, origin)

	track(t, deps, firstStation)
	walkRegion(t, deps)
	derive(t, deps)

	held, err := deps.MarketPages.PageNumbers(t.Context(), testRegion)
	if err != nil {
		t.Fatalf("page numbers: %v", err)
	}
	if len(held) != 3 {
		t.Fatalf("held %v after the first walk, want three pages", held)
	}

	// The book loses its last page, as a quiet market's does.
	origin.pages = 2
	walkRegion(t, deps)

	held, err = deps.MarketPages.PageNumbers(t.Context(), testRegion)
	if err != nil {
		t.Fatalf("page numbers: %v", err)
	}
	if len(held) != 2 {
		t.Errorf("held %v after the book shrank, want only the two pages it still has", held)
	}

	// And the derive that follows reads only what the book still holds.
	derive(t, deps)
	if pricedTypes(t, fake, firstStation) == 0 {
		t.Error("the station was priced for no types after the shrink")
	}
}
