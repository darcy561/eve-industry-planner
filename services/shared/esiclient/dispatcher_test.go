package esiclient_test

import (
	"context"
	"errors"
	"net/http"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"eve-industry-planner/shared/esiclient"
	"eve-industry-planner/testing/httpfake"
	"eve-industry-planner/testing/redisfake"
)

// esiFake answers like ESI: rate-limit headers on every response, and a
// configurable allowance so a test can exhaust it.
type esiFake struct {
	fake  *httpfake.Server
	limit int

	mu          sync.Mutex
	calls       int
	spent       int
	status      int
	group       string
	limitHeader string
}

func newESIFake(t *testing.T, limit int) *esiFake {
	t.Helper()
	e := &esiFake{
		fake: httpfake.New(t), limit: limit, status: http.StatusOK,
		group: "market-order", limitHeader: "12000/15m",
	}
	e.fake.Handle(http.MethodGet, "/markets/10000002/orders/", e.serve)
	e.fake.Handle(http.MethodGet, "/status/", e.serve)
	return e
}

func (e *esiFake) serve(w http.ResponseWriter, _ *http.Request) {
	e.mu.Lock()
	e.calls++
	status := e.status
	e.spent += esiclient.TokenCost(status)
	remaining := e.limit - e.spent
	group := e.group
	limitHeader := e.limitHeader
	e.mu.Unlock()

	w.Header().Set("X-Ratelimit-Group", group)
	w.Header().Set("X-Ratelimit-Limit", limitHeader)
	w.Header().Set("X-Ratelimit-Remaining", itoa(max(remaining, 0)))
	w.Header().Set("ETag", `"v1"`)
	if status == http.StatusTooManyRequests {
		w.Header().Set("Retry-After", "60")
	}
	w.WriteHeader(status)
	_, _ = w.Write([]byte(`[]`))
}

func (e *esiFake) setStatus(status int) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.status = status
}

func (e *esiFake) spentTokens() int {
	e.mu.Lock()
	defer e.mu.Unlock()
	return e.spent
}

func (e *esiFake) callCount() int {
	e.mu.Lock()
	defer e.mu.Unlock()
	return e.calls
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	digits := ""
	for n > 0 {
		digits = string(rune('0'+n%10)) + digits
		n /= 10
	}
	return digits
}

func newClient(t *testing.T, e *esiFake, adjust ...func(*esiclient.Config)) *esiclient.Client {
	t.Helper()
	rdb := redisfake.New(t)

	cfg := esiclient.DefaultConfig()
	cfg.BaseURL = e.fake.BaseURL()
	cfg.Transport = e.fake.Client().Transport
	for _, fn := range adjust {
		fn(&cfg)
	}

	client, stop, err := esiclient.New(rdb.Client, cfg)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	t.Cleanup(stop)
	return client
}

var ordersRequest = esiclient.Request{
	Method:      http.MethodGet,
	Path:        "/markets/10000002/orders/",
	IfNoneMatch: `"v1"`,
}

func TestCallReachesESIThroughTheDispatcher(t *testing.T) {
	fake := newESIFake(t, 12000)
	client := newClient(t, fake)

	resp, err := client.Do(t.Context(), ordersRequest)
	if err != nil {
		t.Fatalf("Do: %v", err)
	}
	if resp.Status != http.StatusOK {
		t.Errorf("Status = %d", resp.Status)
	}
	if resp.Bucket.Group != "market-order" {
		t.Errorf("Bucket = %s, want the group the response disclosed", resp.Bucket)
	}
	if resp.Cost != 2 {
		t.Errorf("Cost = %d, want 2 for a 2xx", resp.Cost)
	}
}

func TestGroupIsLearnedSoTheSecondCallKnowsItsBucket(t *testing.T) {
	fake := newESIFake(t, 12000)
	client := newClient(t, fake)

	first, err := client.Do(t.Context(), ordersRequest)
	if err != nil {
		t.Fatalf("first Do: %v", err)
	}
	second, err := client.Do(t.Context(), ordersRequest)
	if err != nil {
		t.Fatalf("second Do: %v", err)
	}

	if first.Bucket.Group != second.Bucket.Group {
		t.Errorf("bucket moved between calls: %s then %s", first.Bucket, second.Bucket)
	}
	room, err := client.Headroom(t.Context(), ordersRequest.Path, esiclient.Identity{}, esiclient.ClassBackground)
	if err != nil {
		t.Fatalf("Headroom: %v", err)
	}
	if room.Bucket.Group != "market-order" {
		t.Errorf("Headroom asked about %s; the learned group should be used", room.Bucket)
	}
}

func TestConditionalEndpointRefusesToDiscardAValidator(t *testing.T) {
	fake := newESIFake(t, 12000)
	client := newClient(t, fake)

	// The first fetch of a path has no validator to send, and must be allowed.
	unconditional := esiclient.Request{Method: http.MethodGet, Path: "/markets/10000002/orders/"}
	if _, err := client.Do(t.Context(), unconditional); err != nil {
		t.Fatalf("a first fetch has nothing to send yet: %v", err)
	}
	if fake.callCount() != 1 {
		t.Fatalf("the first call should reach ESI, saw %d", fake.callCount())
	}

	// That response carried an ETag for this exact request — path and query
	// together, because a paginated endpoint issues one per page. Dropping it on
	// the next pass doubles what the call costs, so it is refused before it
	// reaches the network.
	before := fake.callCount()
	if _, err := client.Do(t.Context(), unconditional); err == nil {
		t.Fatal("a conditional endpoint should refuse to throw away a validator it was given")
	}
	if fake.callCount() != before {
		t.Error("the refused request should not reach ESI")
	}

	// Sending it is fine.
	conditional := unconditional
	conditional.IfNoneMatch = `"v1"`
	if _, err := client.Do(t.Context(), conditional); err != nil {
		t.Errorf("a call carrying its validator should proceed: %v", err)
	}
}

func TestInteractiveTakesTheNextSlotAheadOfBulk(t *testing.T) {
	fake := newESIFake(t, 12000)
	client := newClient(t, fake, func(c *esiclient.Config) {
		c.Mode = esiclient.ModeDirect
		c.Tolerance = map[esiclient.Class]time.Duration{
			esiclient.ClassBackground:    5 * time.Second,
			esiclient.ClassUserRequested: 5 * time.Second,
		}
		c.Endpoints = []esiclient.EndpointPolicy{{
			Pattern:           "/markets/{region_id}/orders/",
			CompatibilityDate: "2025-12-16",
			MinSpacing:        120 * time.Millisecond,
			Conditional:       true,
		}}
	})

	// Warm the bucket so the queue is not sitting behind discovery.
	if _, err := client.Do(t.Context(), ordersRequest); err != nil {
		t.Fatalf("warm: %v", err)
	}

	var order []string
	var mu sync.Mutex
	var wg sync.WaitGroup

	record := func(name string) {
		mu.Lock()
		order = append(order, name)
		mu.Unlock()
	}

	// Fill the queue with bulk first, then add one interactive behind them.
	for i := range 3 {
		wg.Go(func() {
			req := ordersRequest
			req.Class = esiclient.ClassBackground
			if _, err := client.Do(t.Context(), req); err == nil {
				record("bulk")
			}
			_ = i
		})
	}
	time.Sleep(30 * time.Millisecond)
	wg.Go(func() {
		req := ordersRequest
		req.Class = esiclient.ClassUserRequested
		if _, err := client.Do(t.Context(), req); err == nil {
			record("interactive")
		}
	})
	wg.Wait()

	mu.Lock()
	defer mu.Unlock()
	if len(order) < 2 {
		t.Fatalf("only %d calls completed: %v", len(order), order)
	}
	// It arrived last but should not have been served last.
	if order[len(order)-1] == "interactive" {
		t.Errorf("interactive was served last: %v", order)
	}
}

func TestWaiterCapRefusesRatherThanQueueForever(t *testing.T) {
	fake := newESIFake(t, 12000)
	client := newClient(t, fake, func(c *esiclient.Config) {
		c.Mode = esiclient.ModeDirect
		c.WaiterCap = 2
		c.Tolerance = map[esiclient.Class]time.Duration{esiclient.ClassBackground: 2 * time.Second}
		c.Endpoints = []esiclient.EndpointPolicy{{
			Pattern:           "/markets/{region_id}/orders/",
			CompatibilityDate: "2025-12-16",
			MinSpacing:        300 * time.Millisecond,
			Conditional:       true,
		}}
	})
	if _, err := client.Do(t.Context(), ordersRequest); err != nil {
		t.Fatalf("warm: %v", err)
	}

	var refused atomic.Int32
	var wg sync.WaitGroup
	for range 8 {
		wg.Go(func() {
			if _, err := client.Do(t.Context(), ordersRequest); err != nil {
				if _, ok := esiclient.AsRateLimit(err); ok {
					refused.Add(1)
				}
			}
		})
	}
	wg.Wait()

	if refused.Load() == 0 {
		t.Error("with a cap of 2 waiters and eight callers, some should be turned away rather than all queued")
	}
}

func TestSpentBucketRefusesWithRecoveryTime(t *testing.T) {
	fake := newESIFake(t, 12000)
	client := newClient(t, fake, func(c *esiclient.Config) {
		c.Mode = esiclient.ModeDirect
		c.Tolerance = map[esiclient.Class]time.Duration{esiclient.ClassBackground: 50 * time.Millisecond}
		c.Endpoints = []esiclient.EndpointPolicy{{
			Pattern:           "/markets/{region_id}/orders/",
			CompatibilityDate: "2025-12-16",
			MinSpacing:        time.Millisecond,
			Conditional:       true,
		}}
	})

	fake.setStatus(http.StatusTooManyRequests)
	if _, err := client.Do(t.Context(), ordersRequest); err != nil {
		t.Fatalf("the 429 itself should come back as a response: %v", err)
	}

	_, err := client.Do(t.Context(), ordersRequest)
	refusal, ok := esiclient.AsRateLimit(err)
	if !ok {
		t.Fatalf("err = %v, want a rate limit refusal after the 429 gated the bucket", err)
	}
	if refusal.Kind != esiclient.KindGated {
		t.Errorf("Kind = %s, want gated", refusal.Kind)
	}
	if wait := refusal.RetryIn(); wait < 50*time.Second {
		t.Errorf("RetryIn = %v, want about the stated 60s", wait)
	}
}

func TestCancelledCallerCostsNoSlot(t *testing.T) {
	fake := newESIFake(t, 12000)
	client := newClient(t, fake, func(c *esiclient.Config) {
		c.Mode = esiclient.ModeDirect
		c.Tolerance = map[esiclient.Class]time.Duration{esiclient.ClassBackground: 5 * time.Second}
		c.Endpoints = []esiclient.EndpointPolicy{{
			Pattern:           "/markets/{region_id}/orders/",
			CompatibilityDate: "2025-12-16",
			MinSpacing:        400 * time.Millisecond,
			Conditional:       true,
		}}
	})
	if _, err := client.Do(t.Context(), ordersRequest); err != nil {
		t.Fatalf("warm: %v", err)
	}

	ctx, cancel := context.WithCancel(t.Context())
	done := make(chan error, 1)
	go func() {
		_, err := client.Do(ctx, ordersRequest)
		done <- err
	}()
	time.Sleep(30 * time.Millisecond)
	cancel()

	select {
	case err := <-done:
		if err == nil {
			return // it won the race and got its slot, which is also fine
		}
		if !errors.Is(err, context.Canceled) && !esiclient.IsRateLimit(err) {
			t.Errorf("err = %v, want cancellation or a refusal", err)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("a cancelled caller should not stay parked")
	}

	// The dispatcher must still serve the next caller.
	if _, err := client.Do(t.Context(), ordersRequest); err != nil {
		t.Errorf("a walked-away caller broke the queue: %v", err)
	}
}

func TestDiscoveryHappensOncePerPathNotTwice(t *testing.T) {
	fake := newESIFake(t, 12000)
	client := newClient(t, fake, func(c *esiclient.Config) {
		c.Mode = esiclient.ModeDirect
		c.Endpoints = []esiclient.EndpointPolicy{{
			Pattern:           "/markets/{region_id}/orders/",
			CompatibilityDate: "2025-12-16",
			MinSpacing:        time.Millisecond,
			Conditional:       true,
		}}
	})

	// One call is enough to learn the group. The allowance must land on the real
	// bucket, not on the placeholder the first call guessed at, or every path
	// rediscovers — and concurrent callers meet that second discovery at once.
	if _, err := client.Do(t.Context(), ordersRequest); err != nil {
		t.Fatalf("first Do: %v", err)
	}

	var refused atomic.Int32
	var wg sync.WaitGroup
	for range 5 {
		wg.Go(func() {
			if _, err := client.Do(t.Context(), ordersRequest); err != nil {
				if refusal, ok := esiclient.AsRateLimit(err); ok && refusal.Kind == esiclient.KindDiscovering {
					refused.Add(1)
				}
			}
		})
	}
	wg.Wait()

	if refused.Load() > 0 {
		t.Errorf("%d callers hit a second discovery; the allowance should already be known", refused.Load())
	}
}

func TestSpendNeverExceedsTheAllowance(t *testing.T) {
	const allowance = 40
	fake := newESIFake(t, allowance)
	client := newClient(t, fake, func(c *esiclient.Config) {
		c.Mode = esiclient.ModeDirect
		c.Tolerance = map[esiclient.Class]time.Duration{esiclient.ClassBackground: 200 * time.Millisecond}
		c.Endpoints = []esiclient.EndpointPolicy{{
			Pattern:           "/markets/{region_id}/orders/",
			CompatibilityDate: "2025-12-16",
			MinSpacing:        time.Millisecond,
			Conditional:       true,
		}}
	})

	// Teach the bucket a small allowance, then flood it.
	fake.mu.Lock()
	fake.limitHeader = "40/15m"
	fake.mu.Unlock()
	if _, err := client.Do(t.Context(), ordersRequest); err != nil {
		t.Fatalf("warm: %v", err)
	}

	var wg sync.WaitGroup
	for range 60 {
		wg.Go(func() {
			_, _ = client.Do(t.Context(), ordersRequest)
		})
	}
	wg.Wait()

	spent := fake.spentTokens()
	if spent > allowance {
		t.Errorf("spent %d tokens against an allowance of %d — the ledger let callers through it", spent, allowance)
	}
	if spent == 0 {
		t.Error("nothing got through at all")
	}
}
