// What a market price query puts on the wire in each direction, written down
// where the SPA can read it.
//
// The SPA builds the request body by hand and reads the answer key by key —
// `answer.sources[id].prices[typeID].buyP95` and the rest. A key it reads that
// the server does not send yields undefined and prices something at nothing;
// a key the server expects that the SPA does not send asks for nothing at all.
// Neither side's own tests notice, because each asserts against fixtures it
// authored itself.
//
// So both shapes are derived from the Go types by reflection, committed, and
// checked here. The SPA's own parity test reads the same file, which is what
// makes a field moved on one side fail on the other.
//
// This is the wire; how a market's orders become the four prices behind it is
// held in agreement separately, by
// `services/worker/tasks/esi/derivation_parity_test.go`.
package v1endpoints_test

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"eve-industry-planner/api/v1endpoints"

	modelparity "eve-industry-planner/testing/model_parity/lib"
)

// marketPricesSurfacePath is the committed fixture, relative to this package.
const marketPricesSurfacePath = "../../../testing/fixtures/market-prices/surface.json"

const regenerateMarketPrices = "EIP_UPDATE_MARKET_PRICES_SURFACE=1 go test ./api/v1endpoints/ -run TestTheMarketPricesSurfaceIsCurrent"

const marketPricesWhy = "Every JSON path a market price query carries, in both " +
	"directions, against the kind of value each one holds, by reflection over " +
	"the Go types. A path alone says a key exists; the kind is what stops a " +
	"figure the SPA sums becoming a string nobody notices. " +
	"Regenerate with: " + regenerateMarketPrices

type marketPricesSurface struct {
	Why   string                       `json:"why"`
	Types map[string]map[string]string `json:"types"`
}

// Both directions, because the SPA authors one and parses the other.
func currentMarketPricesSurface() marketPricesSurface {
	return marketPricesSurface{
		Why: marketPricesWhy,
		Types: map[string]map[string]string{
			"MarketPricesQueryBody": modelparity.JSONKinds(
				reflect.TypeFor[v1endpoints.MarketPricesQueryBody](),
			),
			"MarketPricesQueryResponse": modelparity.JSONKinds(
				reflect.TypeFor[v1endpoints.MarketPricesQueryResponse](),
			),
		},
	}
}

// A request or response type gaining or losing a field changes what the SPA may
// write or read, so the committed surface has to move with it in the same commit.
func TestTheMarketPricesSurfaceIsCurrent(t *testing.T) {
	current := currentMarketPricesSurface()

	encoded, err := json.MarshalIndent(current, "", "  ")
	if err != nil {
		t.Fatalf("encode the surface: %v", err)
	}
	encoded = append(encoded, '\n')

	if os.Getenv("EIP_UPDATE_MARKET_PRICES_SURFACE") == "1" {
		if err := os.MkdirAll(filepath.Dir(marketPricesSurfacePath), 0o755); err != nil {
			t.Fatalf("create the fixture directory: %v", err)
		}
		if err := os.WriteFile(marketPricesSurfacePath, encoded, 0o644); err != nil {
			t.Fatalf("write the surface: %v", err)
		}
		t.Logf("wrote %s", marketPricesSurfacePath)
		return
	}

	committed, err := os.ReadFile(marketPricesSurfacePath)
	if err != nil {
		t.Fatalf("read the committed surface: %v\nregenerate with: %s", err, regenerateMarketPrices)
	}
	if string(committed) != string(encoded) {
		t.Fatalf("the committed market prices surface is stale.\n"+
			"A wire type changed without %s moving with it, so the SPA is "+
			"checking its request and its parsing against a surface that no "+
			"longer exists.\nRegenerate with: %s",
			marketPricesSurfacePath, regenerateMarketPrices)
	}
}

// The paths the SPA is known to write and read, asserted here as well as in the
// SPA's own parity test. A Go author moving one of these sees a Go test fail
// rather than hearing about it from a client that priced everything at nothing.
func TestTheMarketPricesSurfaceCarriesWhatTheClientUses(t *testing.T) {
	surface := currentMarketPricesSurface()

	// What `priceLoader.js` builds: a market names its own types, and the
	// adjusted prices are their own list rather than a flag over those types.
	for path, kind := range map[string]string{
		"sources": "object", "sources.{id}": "array", "sources.{id}[]": "string",
		"adjustedTypeIDs": "array", "adjustedTypeIDs[]": "string",
	} {
		if held := surface.Types["MarketPricesQueryBody"][path]; held != kind {
			t.Errorf("a market price request carries %q as %q, and the SPA sends %q",
				path, held, kind)
		}
	}

	// What `priceLoader.js` reads off the answer. The four order types are the
	// row a priced surface draws, and `refreshedAt` is the market's own clock,
	// which decides what the browser still holds rather than an age guess.
	for path, kind := range map[string]string{
		"sources": "object", "sources.{id}": "object",
		"sources.{id}.refreshedAt": "number",
		"sources.{id}.prices":      "object", "sources.{id}.prices.{id}": "object",
		"sources.{id}.prices.{id}.buy":     "number",
		"sources.{id}.prices.{id}.sell":    "number",
		"sources.{id}.prices.{id}.buyP95":  "number",
		"sources.{id}.prices.{id}.sellP05": "number",
		"adjusted":                         "object", "adjusted.refreshedAt": "number",
		"adjusted.prices": "object", "adjusted.prices.{id}": "number",
	} {
		if held := surface.Types["MarketPricesQueryResponse"][path]; held != kind {
			t.Errorf("a market price answer carries %q as %q, and the SPA reads it as %q",
				path, held, kind)
		}
	}
}
