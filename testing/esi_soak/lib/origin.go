// Package esisoak drives many replicas at ESI through the shared limiter and
// reports whether the fleet stayed inside the budget.
//
// The origin here meters the way ESI does — a floating window of token charges,
// and a 429 once the allowance is gone. That makes it the judge rather than a
// stub: if the limiter is right, the origin never has to refuse anyone, and a
// single 429 is the harness telling us the fleet overspent.
package esisoak

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync"
	"time"
)

// charge is one token cost and when it stops counting.
type charge struct {
	cost    int
	expires time.Time
}

// Origin is a stand-in for ESI that enforces its own allowance.
type Origin struct {
	allowance int
	window    time.Duration
	group     string
	pages     int

	mu        sync.Mutex
	charges   []charge
	requests  int
	refusals  int
	peakSpend int
	down      bool
	downFrom  int
	server    *httptest.Server
}

// OriginConfig describes the budget the origin will enforce.
type OriginConfig struct {
	Allowance int
	Window    time.Duration
	Group     string
	// Pages is reported as X-Pages, so a caller can walk a book.
	Pages int
}

// NewOrigin starts a metering ESI stand-in. Close it when done.
func NewOrigin(cfg OriginConfig) *Origin {
	if cfg.Allowance <= 0 {
		cfg.Allowance = 12000
	}
	if cfg.Window <= 0 {
		cfg.Window = 15 * time.Minute
	}
	if cfg.Group == "" {
		cfg.Group = "market-order"
	}
	if cfg.Pages <= 0 {
		cfg.Pages = 1
	}

	o := &Origin{allowance: cfg.Allowance, window: cfg.Window, group: cfg.Group, pages: cfg.Pages}
	o.server = httptest.NewServer(http.HandlerFunc(o.serve))
	return o
}

// URL is where the origin listens.
func (o *Origin) URL() string { return o.server.URL }

// Transport reaches the origin.
func (o *Origin) Transport() http.RoundTripper { return o.server.Client().Transport }

// Close stops the origin.
func (o *Origin) Close() { o.server.Close() }

func (o *Origin) serve(w http.ResponseWriter, r *http.Request) {
	o.mu.Lock()
	o.sweep(time.Now())

	// An outage answers 502 like the real thing does, and costs no tokens — the
	// server's fault is free, which is exactly why a limiter that keeps trying
	// is not stopped by the token budget.
	if o.down {
		o.requests++
		o.mu.Unlock()
		w.Header().Set("X-Ratelimit-Group", o.group)
		w.WriteHeader(http.StatusBadGateway)
		return
	}

	spent := o.spent()
	status := http.StatusOK
	if r.Header.Get("If-None-Match") != "" && spent%7 == 0 {
		// Some passes are unchanged, as a real book's would be.
		status = http.StatusNotModified
	}
	if spent+2 > o.allowance {
		status = http.StatusTooManyRequests
		o.refusals++
	}

	cost := tokenCost(status)
	if cost > 0 {
		o.charges = append(o.charges, charge{cost: cost, expires: time.Now().Add(o.window)})
	}
	o.requests++
	after := o.spent()
	o.peakSpend = max(o.peakSpend, after)
	remaining := max(o.allowance-after, 0)
	o.mu.Unlock()

	w.Header().Set("X-Ratelimit-Group", o.group)
	w.Header().Set("X-Ratelimit-Limit", fmt.Sprintf("%d/%s", o.allowance, shortDuration(o.window)))
	w.Header().Set("X-Ratelimit-Remaining", fmt.Sprint(remaining))
	w.Header().Set("X-Pages", fmt.Sprint(o.pages))
	w.Header().Set("ETag", `"soak"`)
	w.Header().Set("Cache-Control", "public, max-age=300")
	if status == http.StatusTooManyRequests {
		w.Header().Set("Retry-After", "5")
	}
	w.WriteHeader(status)
	if status != http.StatusNotModified {
		_, _ = w.Write([]byte(`[]`))
	}
}

// sweep drops charges whose window has passed, so the origin's window floats
// the way ESI's does rather than resetting in a block.
func (o *Origin) sweep(now time.Time) {
	live := o.charges[:0]
	for _, c := range o.charges {
		if c.expires.After(now) {
			live = append(live, c)
		}
	}
	o.charges = live
}

func (o *Origin) spent() int {
	total := 0
	for _, c := range o.charges {
		total += c.cost
	}
	return total
}

// GoDown makes the origin answer 502, as Tranquility does while it restarts.
func (o *Origin) GoDown() {
	o.mu.Lock()
	defer o.mu.Unlock()
	o.down = true
	o.downFrom = o.requests
}

// ComeBack ends the outage.
func (o *Origin) ComeBack() {
	o.mu.Lock()
	defer o.mu.Unlock()
	o.down = false
}

// RequestsSinceDown is how many calls reached the origin while it was away,
// which is the figure that matters: each one is a non-2xx counting toward the
// fleet-wide limit that returns 420 across every route.
func (o *Origin) RequestsSinceDown() int {
	o.mu.Lock()
	defer o.mu.Unlock()
	return o.requests - o.downFrom
}

// Stats is what the origin saw.
type Stats struct {
	Requests  int
	Refusals  int
	PeakSpend int
	Allowance int
}

// Stats reports the origin's own accounting.
func (o *Origin) Stats() Stats {
	o.mu.Lock()
	defer o.mu.Unlock()
	o.sweep(time.Now())
	return Stats{Requests: o.requests, Refusals: o.refusals, PeakSpend: o.peakSpend, Allowance: o.allowance}
}

func tokenCost(status int) int {
	switch {
	case status == http.StatusTooManyRequests:
		return 0
	case status >= 200 && status < 300:
		return 2
	case status >= 300 && status < 400:
		return 1
	case status >= 400 && status < 500:
		return 5
	default:
		return 0
	}
}

func shortDuration(d time.Duration) string {
	switch {
	case d >= time.Hour:
		return fmt.Sprintf("%dh", int(d.Hours()))
	case d >= time.Minute:
		return fmt.Sprintf("%dm", int(d.Minutes()))
	default:
		return fmt.Sprintf("%ds", int(d.Seconds()))
	}
}
