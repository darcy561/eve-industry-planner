// What a saved market lane is held to, written down where the SPA can read it.
//
// The server refuses a lane that breaks these, and the SPA stops a reader
// building one that would be refused — a rate typed past the ceiling reaches a
// reader as nothing but a figure that never sticks, because the save fails with
// no other sign. Both sides therefore carry the limit, and nothing but this file
// connects the two copies.
package models_test

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"eve-industry-planner/shared/models"
)

// limitsPath is the committed fixture, relative to this package.
const limitsPath = "../../../testing/fixtures/market-limits/limits.json"

const regenerateLimits = "EIP_UPDATE_MARKET_LIMITS=1 go test ./shared/models/ -run TestTheMarketLimitsAreCurrent"

const limitsWhy = "What MarketLocations.Validate holds a saved market lane to. " +
	"The SPA enforces these at the field, so a reader cannot build a document " +
	"the save is refused for. Regenerate with: " + regenerateLimits

// marketLimits carries only the limits the SPA enforces. One it does not is one
// this file would claim to be guarding and would not be.
type marketLimits struct {
	Why             string  `json:"why"`
	MaxBrokerFeePct float64 `json:"maxBrokerFeePercent"`
}

func currentMarketLimits() marketLimits {
	return marketLimits{
		Why:             limitsWhy,
		MaxBrokerFeePct: models.MaxBrokerFeePercent,
	}
}

// Moving a limit changes what the SPA must let a reader type, so the committed
// copy has to move with it in the same commit.
func TestTheMarketLimitsAreCurrent(t *testing.T) {
	encoded, err := json.MarshalIndent(currentMarketLimits(), "", "  ")
	if err != nil {
		t.Fatalf("encode the limits: %v", err)
	}
	encoded = append(encoded, '\n')

	if os.Getenv("EIP_UPDATE_MARKET_LIMITS") == "1" {
		if err := os.MkdirAll(filepath.Dir(limitsPath), 0o755); err != nil {
			t.Fatalf("create the fixture directory: %v", err)
		}
		if err := os.WriteFile(limitsPath, encoded, 0o644); err != nil {
			t.Fatalf("write the limits: %v", err)
		}
		t.Logf("wrote %s", limitsPath)
		return
	}

	committed, err := os.ReadFile(limitsPath)
	if err != nil {
		t.Fatalf("read the committed limits: %v\nregenerate with: %s", err, regenerateLimits)
	}
	if string(committed) != string(encoded) {
		t.Fatalf("the committed market limits are stale.\n"+
			"A limit moved without %s moving with it, so the SPA is holding a "+
			"reader to a rule the server no longer has.\n"+
			"Regenerate with: %s",
			limitsPath, regenerateLimits)
	}
}
