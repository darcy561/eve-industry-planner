package esi_test

import (
	"sort"
	"strings"
	"testing"
	"time"

	objectstore "eve-industry-planner/shared/core/objectstore"
	"eve-industry-planner/shared/esiclient"
	eipnats "eve-industry-planner/shared/nats"
	eipredis "eve-industry-planner/shared/redis"
	"eve-industry-planner/testing/redisfake"
	"eve-industry-planner/worker/taskrun"
	esi "eve-industry-planner/worker/tasks/esi"
)

// A region whose pages all answer 304 still rewrites its prices, because the
// write is what renews their expiry. The entries were replayed from the stored
// pages, so they describe the current book.
func TestUnchangedSweepRenewsRegionPrices(t *testing.T) {
	const (
		regionID  = int32(10000002)
		stationID = int64(60003760)
		pages     = 2
	)

	origin := newOrdersOrigin(t, pages, 20)
	fake := redisfake.New(t)

	cfg := esiclient.DefaultConfig()
	cfg.BaseURL = origin.server.URL
	api, stop, err := esiclient.New(eipredis.NewRedis(fake.Client), cfg)
	if err != nil {
		t.Fatalf("esiclient: %v", err)
	}
	t.Cleanup(stop)

	// The pages are what a 304 renews the prices from, so a run without them
	// replays nothing and this test's whole subject disappears.
	deps := &taskrun.Dependencies{
		Redis:       eipredis.NewRedis(fake.Client),
		ESI:         api,
		MarketPages: objectstore.NewMarketPages(objectstore.NewMemoryBackend()),
	}
	req := eipnats.RegionMarketOrdersRequest{RegionID: regionID, StationID: stationID}

	// A priming pass fetches and writes the prices.
	if err := esi.RefreshRegionMarketOrders(t.Context(), req, deps); err != nil {
		t.Fatalf("priming pass: %v", err)
	}
	priced := []string{}
	for _, key := range fake.Server.Keys() {
		if strings.HasPrefix(key, "esi:market_orders:") && strings.Count(key, ":") == 3 {
			priced = append(priced, key)
		}
	}
	sort.Strings(priced)
	if len(priced) == 0 {
		t.Fatal("the priming pass wrote no prices")
	}

	// Age the keys most of the way to expiry, then let every page 304.
	const aged = 90 * time.Minute
	fake.Server.FastForward(aged)
	for page := 1; page <= pages; page++ {
		origin.notModified[page] = true
	}

	before := fake.Server.TTL(priced[0])
	if err := esi.RefreshRegionMarketOrders(t.Context(), req, deps); err != nil {
		t.Fatalf("unchanged pass: %v", err)
	}
	after := fake.Server.TTL(priced[0])

	if after <= before {
		t.Errorf("an unchanged sweep left %s at %v, no better than the %v it had; the prices will lapse",
			priced[0], after, before)
	}
}
