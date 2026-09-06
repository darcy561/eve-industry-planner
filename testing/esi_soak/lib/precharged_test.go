package esisoak_test

import (
	"testing"
	"time"

	"eve-industry-planner/shared/esiclient"
	esisoak "eve-industry-planner/testing/esi_soak/lib"
	"eve-industry-planner/testing/redisfake"
)

// The fleet's ledger starts empty while the origin has already been charged —
// after a deploy, or with another caller behind the same address. The only way
// the fleet learns of it is X-Ratelimit-Remaining, so this holds that it paces
// against what is actually left rather than against its own empty ledger.
func TestTheFleetRespectsAnAllowanceItDidNotStartFresh(t *testing.T) {
	const allowance = 3000
	origin := esisoak.NewOrigin(esisoak.OriginConfig{Allowance: allowance, Window: 30 * time.Second})
	t.Cleanup(origin.Close)
	origin.Preload(allowance * 6 / 10)

	cfg := esisoak.DefaultConfig()
	cfg.Duration = 6 * time.Second
	cfg.Replicas = 3
	cfg.Adjust = func(c *esiclient.Config) { c.Endpoints[0].MinSpacing = 5 * time.Millisecond }

	result, err := esisoak.Run(t.Context(), cfg, origin, redisfake.New(t).Client)
	if err != nil {
		t.Fatalf("soak: %v", err)
	}

	t.Logf("served %d, refused %d, peak %d of %d, %.2f redis commands per call",
		result.Succeeded+result.NotModified, result.Refused429,
		result.Origin.PeakSpend, result.Origin.Allowance, result.RedisPerServed())

	if result.Overspend > 0 {
		t.Errorf("drove the origin %d tokens past its allowance; the preloaded spend was ignored",
			result.Overspend)
	}
	if result.Refused429 > 0 {
		t.Errorf("earned %d refusals — pacing did not account for what was already charged",
			result.Refused429)
	}
	// The headroom left was 40%% of the allowance. Stopping far short of even that
	// would mean the fleet mistook the preloaded spend for its own budget.
	if served := result.Succeeded + result.NotModified; served == 0 {
		t.Error("served nothing against a partly-spent allowance")
	}
}
