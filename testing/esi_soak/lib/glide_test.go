package esisoak_test

import (
	"testing"
	"time"

	"eve-industry-planner/shared/esiclient"
	esisoak "eve-industry-planner/testing/esi_soak/lib"
	"eve-industry-planner/testing/redisfake"
)

// GlideFrom decides how much of the bank is spent at burst pace before the
// interval starts stretching. Too high and budget goes unused; too low and the
// fleet arrives at an empty bucket at full speed, which is what earns a 429.
// The value is chosen from this sweep rather than picked.
func TestGlideFromSweep(t *testing.T) {
	if testing.Short() {
		t.Skip("sweep takes a while")
	}

	for _, glide := range []float64{0.8, 0.5, 0.3, 0.15, 0.05} {
		origin := esisoak.NewOrigin(esisoak.OriginConfig{Allowance: 120, Window: 30 * time.Second})

		cfg := esisoak.DefaultConfig()
		cfg.Duration = 4 * time.Second
		cfg.Replicas = 4
		cfg.Adjust = func(c *esiclient.Config) {
			c.Endpoints[0].MinSpacing = 5 * time.Millisecond
			c.GlideFrom = glide
		}

		result, err := esisoak.Run(t.Context(), cfg, origin, redisfake.New(t).Client)
		if err != nil {
			t.Fatalf("Run: %v", err)
		}
		served := result.Succeeded + result.NotModified
		t.Logf("glide=%.2f  served=%-4d spend=%3d/%d (%2.0f%%)  refusals=%d  decelerating=%d",
			glide, served, result.Origin.PeakSpend, result.Origin.Allowance,
			float64(result.Origin.PeakSpend)/float64(result.Origin.Allowance)*100,
			result.Refused429, result.YieldsByKind["decelerating"])
		origin.Close()
	}
}
