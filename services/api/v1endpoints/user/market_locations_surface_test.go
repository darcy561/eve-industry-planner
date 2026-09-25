// What the composed market set puts on the wire, written down where the SPA can
// read it.
//
// The SPA parses this answer by hand and hands each row straight to the market
// registry, which offers it as somewhere a price may come from. A field it reads
// that the server does not send is a market missing the one fact that decides
// how it is priced — the place it names — and a kind changed underneath a field
// it keeps is worse, because the row still looks whole.
//
// So the shape is derived from the Go types by reflection, committed, and
// checked here. The SPA's own parity test reads the same file.
//
// In-package because the response type is this package's own: a wrapper worth
// exporting only to be reflected over would be production surface widened for a
// test.
package user

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"testing"

	modelparity "eve-industry-planner/testing/model_parity/lib"
)

// marketLocationsSurfacePath is the committed fixture, relative to this package.
const marketLocationsSurfacePath = "../../../../testing/fixtures/market-locations/surface.json"

const regenerateMarketLocations = "EIP_UPDATE_MARKET_LOCATIONS_SURFACE=1 go test ./api/v1endpoints/user/ -run TestTheMarketLocationsSurfaceIsCurrent"

const marketLocationsWhy = "Every JSON path the composed market set carries, " +
	"against the kind of value each one holds, by reflection over the Go types. " +
	"The SPA reads these rows into its market registry, so a path or a kind " +
	"that moves here changes which markets it can offer and how it prices them. " +
	"Regenerate with: " + regenerateMarketLocations

type marketLocationsSurface struct {
	Why   string                       `json:"why"`
	Types map[string]map[string]string `json:"types"`
}

func currentMarketLocationsSurface() marketLocationsSurface {
	return marketLocationsSurface{
		Why: marketLocationsWhy,
		Types: map[string]map[string]string{
			"MarketLocationsResponse": modelparity.JSONKinds(
				reflect.TypeFor[marketLocationsResponse](),
			),
		},
	}
}

// The response type gaining or losing a field changes what the SPA may read, so
// the committed surface has to move with it in the same commit.
func TestTheMarketLocationsSurfaceIsCurrent(t *testing.T) {
	current := currentMarketLocationsSurface()

	encoded, err := json.MarshalIndent(current, "", "  ")
	if err != nil {
		t.Fatalf("encode the surface: %v", err)
	}
	encoded = append(encoded, '\n')

	if os.Getenv("EIP_UPDATE_MARKET_LOCATIONS_SURFACE") == "1" {
		if err := os.MkdirAll(filepath.Dir(marketLocationsSurfacePath), 0o755); err != nil {
			t.Fatalf("create the fixture directory: %v", err)
		}
		if err := os.WriteFile(marketLocationsSurfacePath, encoded, 0o644); err != nil {
			t.Fatalf("write the surface: %v", err)
		}
		t.Logf("wrote %s", marketLocationsSurfacePath)
		return
	}

	committed, err := os.ReadFile(marketLocationsSurfacePath)
	if err != nil {
		t.Fatalf("read the committed surface: %v\nregenerate with: %s", err, regenerateMarketLocations)
	}
	if string(committed) != string(encoded) {
		t.Fatalf("the committed market locations surface is stale.\n"+
			"The response type changed without %s moving with it, so the SPA is "+
			"checking its parsing against a surface that no longer exists.\n"+
			"Regenerate with: %s",
			marketLocationsSurfacePath, regenerateMarketLocations)
	}
}

// The paths the SPA is known to read, asserted here as well as in its own parity
// test. A Go author moving one of these sees a Go test fail rather than hearing
// about it from a reader whose markets stopped being offered.
func TestTheMarketLocationsSurfaceCarriesWhatTheClientReads(t *testing.T) {
	surface := currentMarketLocationsSurface().Types["MarketLocationsResponse"]

	for path, kind := range map[string]string{
		"marketLocations": "array", "marketLocations[]": "object",
		// The place a row names is what decides which kind of market it is and
		// how it is priced; the registry drops a row naming neither.
		"marketLocations[].id":          "string",
		"marketLocations[].name":        "string",
		"marketLocations[].regionID":    "number",
		"marketLocations[].stationID":   "number",
		"marketLocations[].structureID": "number",
		// What a station's broker fee is derived from, and what a citadel's is
		// stated as because nothing can derive it.
		"marketLocations[].raceID":    "number",
		"marketLocations[].ownerID":   "number",
		"marketLocations[].brokerFee": "number",
		// Facts about this reader's answer rather than about the market: which
		// organisation shared it, and when this server last walked its region.
		"marketLocations[].sharedBy":          "string",
		"marketLocations[].sharedWithMembers": "boolean",
		"marketLocations[].pricedAt":          "number",
	} {
		if held := surface[path]; held != kind {
			t.Errorf("the composed market set carries %q as %q, and the SPA reads it as %q",
				path, held, kind)
		}
	}
}
