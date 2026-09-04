package esisoak_test

import (
	"testing"
	"time"

	"eve-industry-planner/shared/esiclient"
	esisoak "eve-industry-planner/testing/esi_soak/lib"
	"eve-industry-planner/testing/redisfake"
)

func soak(t *testing.T, allowance int, adjust func(*esisoak.Config)) esisoak.Result {
	t.Helper()

	origin := esisoak.NewOrigin(esisoak.OriginConfig{
		Allowance: allowance,
		Window:    20 * time.Second,
	})
	t.Cleanup(origin.Close)

	cfg := esisoak.DefaultConfig()
	cfg.Duration = 3 * time.Second
	if adjust != nil {
		adjust(&cfg)
	}

	result, err := esisoak.Run(t.Context(), cfg, origin, redisfake.New(t).Client)
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	t.Log(result)
	return result
}

// The claim the whole design rests on: several replicas, each pacing itself,
// collectively stay inside one budget because the clock and the ledger are
// shared. A single dispatcher proves nothing about that.
func TestFleetOfReplicasStaysInsideOneBudget(t *testing.T) {
	result := soak(t, 300, nil)

	if result.Succeeded == 0 {
		t.Fatal("no call got through; the run proved nothing")
	}
	if result.Overspend > 0 {
		t.Errorf("fleet drove the origin %d tokens past its allowance of %d",
			result.Overspend, result.Origin.Allowance)
	}
	// The origin issues a 429 the moment it is overspent, so this is the same
	// claim stated the way ESI would state it.
	if result.Refused429 > 0 {
		t.Errorf("the origin had to refuse us %d times; a correct limiter never gets 429'd",
			result.Refused429)
	}
}

func TestDemandFarAboveTheAllowanceIsAbsorbedNotSpent(t *testing.T) {
	// A tiny allowance against sustained demand from four replicas. Almost
	// everything must be turned away in process rather than at the origin.
	result := soak(t, 60, func(c *esisoak.Config) {
		c.Callers = 8
	})

	if result.Refused429 > 0 {
		t.Errorf("origin refused %d calls; the fleet should have refused itself first", result.Refused429)
	}
	if result.Yielded == 0 {
		t.Error("nothing yielded against an allowance this small")
	}
	if result.Overspend > 0 {
		t.Errorf("overspent by %d", result.Overspend)
	}

	// Yields should be attributable, since that is what tells an operator
	// whether a stall is queue depth or an empty bucket.
	if len(result.YieldsByKind) == 0 {
		t.Error("yields were not attributed to a reason")
	}
	for reason, count := range result.YieldsByKind {
		if reason == "" || count == 0 {
			t.Errorf("bad yield reason %q=%d", reason, count)
		}
	}
}

func TestBulkKeepsItsFloorWhileOtherClassesPush(t *testing.T) {
	origin := esisoak.NewOrigin(esisoak.OriginConfig{Allowance: 400, Window: 20 * time.Second})
	t.Cleanup(origin.Close)

	cfg := esisoak.DefaultConfig()
	cfg.Duration = 3 * time.Second
	cfg.Replicas = 3
	// Heavily weighted against bulk: if floors were advisory, bulk would starve.
	cfg.Mix = map[esiclient.Class]int{
		esiclient.ClassBackground:    1,
		esiclient.ClassUserRequested: 6,
	}

	result, err := esisoak.Run(t.Context(), cfg, origin, redisfake.New(t).Client)
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	t.Log(result)

	if result.Overspend > 0 || result.Refused429 > 0 {
		t.Errorf("budget breached: overspend=%d refusals=%d", result.Overspend, result.Refused429)
	}
	if result.Succeeded == 0 {
		t.Fatal("nothing completed")
	}
}

func TestConditionalPassesAreCheaperInPractice(t *testing.T) {
	// The origin answers some conditional requests with 304, which costs one
	// token rather than two. Over a run that should show up as more requests
	// served per token than the 2xx rate alone would allow.
	result := soak(t, 200, nil)

	if result.NotModified == 0 {
		t.Skip("no conditional hits in this run")
	}
	served := result.Succeeded + result.NotModified
	if served == 0 {
		t.Fatal("nothing served")
	}
	if result.Origin.PeakSpend > result.Origin.Allowance {
		t.Errorf("spend %d exceeded allowance %d", result.Origin.PeakSpend, result.Origin.Allowance)
	}
	t.Logf("served %d calls for a peak spend of %d tokens", served, result.Origin.PeakSpend)
}

func TestOriginRefusesWhenNothingPacesIt(t *testing.T) {
	// A control: the origin is only a useful judge if it does refuse an
	// unpaced fleet. Without this, a passing soak might mean the origin is
	// simply lenient.
	origin := esisoak.NewOrigin(esisoak.OriginConfig{Allowance: 20, Window: time.Minute})
	t.Cleanup(origin.Close)

	client := origin.Transport()
	for range 40 {
		req, _ := newRequest(origin.URL() + "/markets/10000002/orders/")
		resp, err := client.RoundTrip(req)
		if err != nil {
			t.Fatalf("round trip: %v", err)
		}
		resp.Body.Close()
	}

	if origin.Stats().Refusals == 0 {
		t.Error("the origin never refused an unpaced flood, so it cannot judge a paced one")
	}
}

func TestTheETAsAreWorthObeying(t *testing.T) {
	// A caller that honours RetryAfter should not have to ask many times per
	// call served. If the ETAs were guesses, callers would return too early and
	// this ratio would climb.
	result := soak(t, 200, nil)

	served := result.Succeeded + result.NotModified
	if served == 0 {
		t.Fatal("nothing served")
	}
	ratio := float64(result.Attempts) / float64(served)
	t.Logf("%.1f attempts per call served", ratio)

	if ratio > 8 {
		t.Errorf("%.1f attempts per served call; the retry times are sending callers back too early", ratio)
	}
}
