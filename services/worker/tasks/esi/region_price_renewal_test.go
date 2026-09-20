package esi_test

import (
	"sort"
	"strings"
	"testing"
	"time"
)

// A region whose pages all answer 304 still rewrites its prices, because the
// write is what renews their expiry. The entries derive from the stored pages,
// so they describe the current book.
func TestUnchangedSweepRenewsRegionPrices(t *testing.T) {
	const pages = 2

	origin := newOrdersOrigin(t, pages, 20)
	deps, fake := marketTaskDeps(t, origin)

	track(t, deps, firstStation)

	// A priming pass walks the book and prices the station from it.
	walkRegion(t, deps)
	derive(t, deps)

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
	walkRegion(t, deps)
	derive(t, deps)
	after := fake.Server.TTL(priced[0])

	if after <= before {
		t.Errorf("an unchanged sweep left %s at %v, no better than the %v it had; the prices will lapse",
			priced[0], after, before)
	}
}
