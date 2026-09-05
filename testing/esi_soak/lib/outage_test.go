package esisoak_test

import (
	"context"
	"net/http"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"eve-industry-planner/shared/esiclient"
	esisoak "eve-industry-planner/testing/esi_soak/lib"
	"eve-industry-planner/testing/redisfake"
)

// An outage is when a rate limiter can do the most damage. Every response is a
// 5xx, and a 5xx costs no tokens — so the budget, the thing that normally holds
// the fleet back, stops applying exactly when the server can least take the
// traffic. Worse, the legacy limit counts non-2xx/3xx across every ESI route, so
// a fleet that keeps trying through an outage takes itself off the air for
// everything.
//
// What these check is that the fleet notices quickly, keeps sending almost
// nothing while the server is away, and resumes without being told.

type outageFleet struct {
	origin  *esisoak.Origin
	clients []*esiclient.Client
}

func newOutageFleet(t *testing.T, replicas int) *outageFleet {
	t.Helper()

	origin := esisoak.NewOrigin(esisoak.OriginConfig{Allowance: 12000, Window: 15 * time.Minute})
	t.Cleanup(origin.Close)

	// One Redis for the fleet: the gate is shared, which is the point.
	rdb := redisfake.New(t).Client

	fleet := &outageFleet{origin: origin}
	for range replicas {
		cfg := esiclient.DefaultConfig()
		cfg.BaseURL = origin.URL()
		cfg.Transport = origin.Transport()
		cfg.Endpoints = []esiclient.EndpointPolicy{{
			Pattern:           "/markets/{region_id}/orders/",
			CompatibilityDate: "2025-12-16",
			MinSpacing:        5 * time.Millisecond,
			Conditional:       true,
		}}
		client, stop, err := esiclient.New(rdb, cfg)
		if err != nil {
			t.Fatalf("New: %v", err)
		}
		t.Cleanup(stop)
		fleet.clients = append(fleet.clients, client)
	}
	return fleet
}

// hammer drives every replica until ctx ends, counting outcomes.
func (f *outageFleet) hammer(ctx context.Context, callersEach int) (served, downtimeYields, otherYields *atomic.Int64) {
	served, downtimeYields, otherYields = &atomic.Int64{}, &atomic.Int64{}, &atomic.Int64{}

	var wg sync.WaitGroup
	for _, client := range f.clients {
		for range callersEach {
			wg.Go(func() {
				req := esiclient.Request{
					Method: http.MethodGet, Path: "/markets/10000002/orders/",
					Class: esiclient.ClassBackground, IfNoneMatch: `"soak"`,
				}
				for ctx.Err() == nil {
					_, err := client.Do(ctx, req)
					switch {
					case err == nil:
						served.Add(1)
					case ctx.Err() != nil:
						return
					default:
						refusal, ok := esiclient.AsRateLimit(err)
						switch {
						case ok && refusal.Kind == esiclient.KindDowntime:
							downtimeYields.Add(1)
						case ok:
							otherYields.Add(1)
						}
					}
					time.Sleep(5 * time.Millisecond)
				}
			})
		}
	}
	go func() { <-ctx.Done(); wg.Wait() }()
	return served, downtimeYields, otherYields
}

func TestFleetStopsCallingAServerThatStoppedAnswering(t *testing.T) {
	fleet := newOutageFleet(t, 3)

	ctx, cancel := context.WithTimeout(t.Context(), 6*time.Second)
	defer cancel()

	served, downtimeYields, _ := fleet.hammer(ctx, 4)

	// Let it settle, then take the server away.
	time.Sleep(700 * time.Millisecond)
	before := served.Load()
	fleet.origin.GoDown()

	time.Sleep(3 * time.Second)
	reached := fleet.origin.RequestsSinceDown()
	yields := downtimeYields.Load()
	cancel()

	t.Logf("before the outage %d served; during it %d calls reached the origin and %d were refused locally",
		before, reached, yields)

	if yields == 0 {
		t.Fatal("no caller was told the server was away")
	}
	// Three seconds of twelve callers is hundreds of attempts. Only the failures
	// that concluded the outage, plus one probe per backoff, should get out.
	if reached > 30 {
		t.Errorf("%d calls reached a server that was down; each is a non-2xx against the fleet-wide limit", reached)
	}
}

func TestFleetResumesWithoutBeingTold(t *testing.T) {
	fleet := newOutageFleet(t, 2)

	// The callers must outlive the recovery window, or the run measures the
	// context expiring rather than the fleet noticing.
	budget := esiclient.DowntimeProbeCeiling() + 15*time.Second
	ctx, cancel := context.WithTimeout(t.Context(), budget)
	defer cancel()

	served, _, _ := fleet.hammer(ctx, 3)
	time.Sleep(500 * time.Millisecond)

	fleet.origin.GoDown()
	time.Sleep(2 * time.Second)
	duringOutage := served.Load()

	// The server returns early, well before any announced window would end.
	fleet.origin.ComeBack()
	returned := time.Now()

	// Recovery costs one backoff: the fleet is waiting on its next probe, and
	// finds out when that lands. Allow the cap plus a margin, because that
	// bound is the whole design decision.
	var resumedBy time.Duration
	deadline := returned.Add(esiclient.DowntimeProbeCeiling() + 5*time.Second)
	for time.Now().Before(deadline) {
		if served.Load() > duringOutage+5 {
			resumedBy = time.Since(returned)
			break
		}
		time.Sleep(100 * time.Millisecond)
	}
	cancel()

	if resumedBy == 0 {
		t.Fatalf("the fleet never resumed within %v of the server returning",
			esiclient.DowntimeProbeCeiling()+5*time.Second)
	}
	t.Logf("resumed %v after the server returned (probe ceiling %v)",
		resumedBy.Round(100*time.Millisecond), esiclient.DowntimeProbeCeiling())

	// Recovery follows the server, not a clock — but it must not exceed the
	// backoff it is waiting on.
	if resumedBy > esiclient.DowntimeProbeCeiling()+3*time.Second {
		t.Errorf("took %v to notice the server was back, past the %v ceiling",
			resumedBy, esiclient.DowntimeProbeCeiling())
	}
}

func TestOnlyOneReplicaProbesADownServer(t *testing.T) {
	fleet := newOutageFleet(t, 4)

	ctx, cancel := context.WithTimeout(t.Context(), 5*time.Second)
	defer cancel()

	fleet.hammer(ctx, 3)
	time.Sleep(500 * time.Millisecond)

	fleet.origin.GoDown()
	time.Sleep(3 * time.Second)
	reached := fleet.origin.RequestsSinceDown()
	cancel()

	t.Logf("four replicas, twelve callers, three seconds of outage: %d calls reached the origin", reached)

	// Without a shared gate each replica would conclude the outage separately
	// and probe on its own schedule, so the count would scale with the fleet.
	if reached > 30 {
		t.Errorf("%d calls got out; the gate is meant to be fleet-wide, not per replica", reached)
	}
}

func TestAHealthyServerIsCalledWhateverTheTimeOfDay(t *testing.T) {
	// Nothing in the limiter knows when CCP says downtime is. A server that
	// answers is called, at 11:05 UTC or any other moment — which is the whole
	// reason the announced window was taken out: a clock cannot be wrong about
	// something it does not decide.
	fleet := newOutageFleet(t, 1)
	ctx, cancel := context.WithTimeout(t.Context(), time.Second)
	defer cancel()

	served, downtimeYields, _ := fleet.hammer(ctx, 2)
	time.Sleep(700 * time.Millisecond)
	cancel()

	if served.Load() == 0 {
		t.Error("a healthy server should be called")
	}
	if downtimeYields.Load() > 0 {
		t.Errorf("%d calls were refused for downtime while the server was answering", downtimeYields.Load())
	}
}
