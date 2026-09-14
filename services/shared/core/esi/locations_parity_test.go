// Which markets the server prices, written down where the SPA can read it.
//
// Both sides carry this list: the server walks these regions and serves prices
// for these stations, and the SPA offers them to a reader and labels a figure
// with one of them. Nothing connects the two copies, so a hub added here and
// forgotten there is a hub the server prices and no reader can choose — and
// neither side's own tests would notice.
//
// So the list is derived from DefaultMarketLocations, committed, and checked
// here. The SPA's own parity test reads the same file.
package esi_test

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	esicore "eve-industry-planner/shared/core/esi"
)

// hubsPath is the committed fixture, relative to this package.
const hubsPath = "../../../../testing/fixtures/market-hubs/hubs.json"

const regenerate = "EIP_UPDATE_MARKET_HUBS=1 go test ./shared/core/esi/ -run TestTheMarketHubListIsCurrent"

const hubsWhy = "The markets this server prices against, from " +
	"esicore.DefaultMarketLocations. The SPA carries its own copy to offer and " +
	"label them, and nothing but this file connects the two. " +
	"Regenerate with: " + regenerate

// hub is one market, in the field names the SPA uses. The fixture exists to be
// read by the SPA, so it is written in the SPA's terms rather than the wire's.
type hub struct {
	Name      string `json:"name"`
	RegionID  int32  `json:"regionID"`
	StationID int64  `json:"stationID"`
}

// marketHubs is keyed by id rather than ordered, because the order is not part
// of the agreement: the server lists Jita first, and the SPA lists the four
// alphabetically because that is the order a reader picks from.
type marketHubs struct {
	Why  string         `json:"why"`
	Hubs map[string]hub `json:"hubs"`
}

func currentMarketHubs() marketHubs {
	hubs := make(map[string]hub, len(esicore.DefaultMarketLocations))
	for _, location := range esicore.DefaultMarketLocations {
		hubs[location.ID] = hub{
			Name:      location.Name,
			RegionID:  location.RegionID,
			StationID: location.StationID,
		}
	}
	return marketHubs{Why: hubsWhy, Hubs: hubs}
}

// Adding or moving a hub changes what the SPA must offer, so the committed list
// has to move with it in the same commit.
func TestTheMarketHubListIsCurrent(t *testing.T) {
	encoded, err := json.MarshalIndent(currentMarketHubs(), "", "  ")
	if err != nil {
		t.Fatalf("encode the hubs: %v", err)
	}
	encoded = append(encoded, '\n')

	if os.Getenv("EIP_UPDATE_MARKET_HUBS") == "1" {
		if err := os.MkdirAll(filepath.Dir(hubsPath), 0o755); err != nil {
			t.Fatalf("create the fixture directory: %v", err)
		}
		if err := os.WriteFile(hubsPath, encoded, 0o644); err != nil {
			t.Fatalf("write the hubs: %v", err)
		}
		t.Logf("wrote %s", hubsPath)
		return
	}

	committed, err := os.ReadFile(hubsPath)
	if err != nil {
		t.Fatalf("read the committed hubs: %v\nregenerate with: %s", err, regenerate)
	}
	if string(committed) != string(encoded) {
		t.Fatalf("the committed market hub list is stale.\n"+
			"DefaultMarketLocations changed without %s moving with it, so the SPA "+
			"is offering a set of markets the server no longer prices.\n"+
			"Regenerate with: %s",
			hubsPath, regenerate)
	}
}

// A hub with no station or no region cannot be priced: the region is what the
// walk fetches and the station is what the prices are filtered to.
func TestEveryMarketHubCanBeWalked(t *testing.T) {
	for _, location := range esicore.DefaultMarketLocations {
		if location.ID == "" || location.Name == "" {
			t.Errorf("%+v has no id or no name", location)
		}
		if location.RegionID == 0 {
			t.Errorf("%q has no region to walk", location.ID)
		}
		if location.StationID == 0 {
			t.Errorf("%q has no station to filter to", location.ID)
		}
	}
}
