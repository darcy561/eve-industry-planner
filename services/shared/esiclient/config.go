package esiclient

import (
	"fmt"
	"net/http"
	"strings"
	"time"
)

// BaseURL is the ESI origin.
const BaseURL = "https://esi.evetech.net"

// ClassFloor is the share of a bucket a class may always spend, whatever else is
// competing. Floors are what stop sustained demand in one class starving
// another: capacity above their sum is contended, and goes in class order.
type ClassFloor struct {
	Class Class
	Floor float64
}

// EndpointPolicy tunes how one endpoint is scheduled inside whatever budget ESI
// reports for its bucket. It never states what that budget is.
type EndpointPolicy struct {
	// Pattern is a path template; {} segments match anything.
	Pattern string
	// CompatibilityDate is the X-Compatibility-Date this endpoint's decoding was
	// written against. It decides the response shape, so it is per endpoint and
	// has no package default.
	CompatibilityDate string
	Class             Class
	// Tolerance is how long a caller waits before yielding; 0 takes the class default.
	Tolerance time.Duration
	// MaxShare caps this endpoint's share of a bucket it shares with others.
	MaxShare float64
	// MinSpacing is the burst ceiling: the fastest this endpoint is ever paced,
	// however full the bank.
	MinSpacing time.Duration
	// GlideFrom is the fill ratio at which deceleration begins; 0 takes the
	// package default.
	GlideFrom float64
	// Concurrency bounds simultaneous in-flight calls; 0 is unlimited.
	Concurrency int
	// Conditional requires the call to carry a validator, because a 304 costs
	// one token against a 2xx's two.
	Conditional bool
}

// Config builds a client. Rates and allowances are absent by design: those come
// from ESI. What is here is our own behaviour inside them.
type Config struct {
	BaseURL string
	Mode    Mode
	// Transport overrides the shared traced transport, for a test that must
	// reach a fake origin.
	Transport http.RoundTripper

	// BlockSize is how many slots a dispatcher reserves per round trip in
	// ModeBlock, amortising Redis across sustained demand.
	BlockSize int
	// WaiterCap bounds how many callers wait in process at once, so ESI work
	// cannot occupy every worker slot.
	WaiterCap int
	// Tolerance per class, for endpoints that state none.
	Tolerance map[Class]time.Duration
	// FloorWait is the longest a class still short of its floor will hold its
	// place in the queue rather than yield.
	//
	// A floor is a promise about tokens, but tokens only reach a caller that is
	// still waiting when a slot matures. Bulk has the largest floor and the
	// shortest patience, so without this it leaves before its own guarantee can
	// be honoured — measured, it was served nothing at all under a tight
	// allowance. The caller's own deadline still bounds this.
	FloorWait time.Duration
	// Floors must sum to no more than 1.
	Floors []ClassFloor
	// GlideFrom is the fill ratio at which deceleration begins. Reservation is
	// what keeps the fleet inside the allowance; this only smooths the approach
	// so the bank is not slammed and then stalled on. Measured against a tight
	// allowance, 0.3 spends 88% of a bank with no refusals, and lowering it
	// further buys nothing.
	GlideFrom float64
	// ErrorLimitStop is the count of non-2xx/3xx responses in a minute at which
	// we stop, staying under the 420 that would follow.
	ErrorLimitStop int
	// ProbeTTL is how long one discovery request holds a bucket before another
	// caller may probe.
	ProbeTTL time.Duration

	Endpoints []EndpointPolicy
}

// Mode is how a dispatcher takes slots.
type Mode uint8

const (
	// ModeBlock reserves slots in blocks, for sustained demand.
	ModeBlock Mode = iota
	// ModeDirect takes one slot per call, for low-volume interactive traffic
	// where an unused block would be waste.
	ModeDirect
)

// DefaultConfig is the starting point for both services. The tuning values are
// provisional until a full window is measured; a wrong one costs throughput
// rather than a breach, except the floors, where too small a bulk share is
// starvation.
func DefaultConfig() Config {
	return Config{
		BaseURL:   BaseURL,
		Mode:      ModeBlock,
		BlockSize: 4,
		WaiterCap: 9,
		Tolerance: map[Class]time.Duration{
			ClassBackground:    500 * time.Millisecond,
			ClassUserRequested: 5 * time.Second,
		},
		// Minimums, not expected shares. Above the floors demand decides, so
		// background work still takes most of the throughput on the smaller
		// floor simply by asking more often; what the floor buys is that a
		// person's request is never queued behind a refresh cycle.
		Floors: []ClassFloor{
			{Class: ClassUserRequested, Floor: 0.35},
			{Class: ClassBackground, Floor: 0.30},
		},
		FloorWait:      5 * time.Second,
		GlideFrom:      0.3,
		ErrorLimitStop: 80,
		ProbeTTL:       15 * time.Second,
		Endpoints:      DefaultEndpointPolicies(),
	}
}

// DefaultEndpointPolicies is the source of truth for endpoint tuning. First
// match wins, so put the specific before the general.
func DefaultEndpointPolicies() []EndpointPolicy {
	return []EndpointPolicy{
		{
			Pattern:           "/markets/{region_id}/orders/",
			CompatibilityDate: "2025-12-16",
			Class:             ClassBackground,
			MaxShare:          0.6,
			MinSpacing:        100 * time.Millisecond,
			Concurrency:       1,
			Conditional:       true,
		},
		{
			Pattern:           "/industry/systems/",
			CompatibilityDate: "2025-12-16",
			Class:             ClassBackground,
			MinSpacing:        time.Second,
			Conditional:       true,
		},
		{
			Pattern:           "/markets/prices/",
			CompatibilityDate: "2025-12-16",
			Class:             ClassBackground,
			MinSpacing:        time.Second,
			Conditional:       true,
		},
		{
			Pattern:           "/characters/affiliation/",
			CompatibilityDate: "2025-12-16",
			Class:             ClassBackground,
			MinSpacing:        200 * time.Millisecond,
		},
		{
			Pattern:           "/status/",
			CompatibilityDate: "2025-12-16",
			Class:             ClassBackground,
			MinSpacing:        time.Second,
			Conditional:       true,
		},
	}
}

// Validate reports a configuration that cannot be honoured.
func (c Config) Validate() error {
	var total float64
	seen := map[Class]bool{}
	for _, f := range c.Floors {
		if f.Floor < 0 {
			return fmt.Errorf("floor for %s is negative", f.Class)
		}
		if seen[f.Class] {
			return fmt.Errorf("duplicate floor for %s", f.Class)
		}
		seen[f.Class] = true
		total += f.Floor
	}
	if total > 1 {
		return fmt.Errorf("class floors sum to %.2f, which is more than the bucket holds", total)
	}
	for _, e := range c.Endpoints {
		if e.CompatibilityDate == "" {
			return fmt.Errorf("endpoint %q has no compatibility date, which decides its response shape", e.Pattern)
		}
		if e.MaxShare < 0 || e.MaxShare > 1 {
			return fmt.Errorf("endpoint %q has MaxShare %.2f, want 0 to 1", e.Pattern, e.MaxShare)
		}
	}
	return nil
}

// Floor is the guaranteed share for a class, or zero if it has none.
func (c Config) Floor(class Class) float64 {
	for _, f := range c.Floors {
		if f.Class == class {
			return f.Floor
		}
	}
	return 0
}

// contendedSplit divides the uncommitted remainder between the classes. The
// shares sum to one on purpose: if the caps could together exceed the bucket,
// two classes spending hard would breach the third's floor, and the floor would
// be a suggestion rather than a guarantee.
var contendedSplit = map[Class]float64{
	ClassUserRequested: 0.6,
	ClassBackground:    0.4,
}

// ContendedClaim is the share of the uncommitted remainder a class may take on
// top of its floor. Floor plus claim is therefore the most any class can hold,
// and those caps sum to exactly the bucket.
func (c Config) ContendedClaim(class Class) float64 {
	var floors float64
	for _, f := range c.Floors {
		floors += f.Floor
	}
	return max(1-floors, 0) * contendedSplit[class]
}

// Cap is the most of a bucket a class may hold at once.
func (c Config) Cap(class Class) float64 {
	return c.Floor(class) + c.ContendedClaim(class)
}

// reservedForOthers is the share of a bucket the other classes are still owed,
// as a fraction. It ignores what they have already spent, which the script
// accounts for exactly; this is the conservative view a scheduler should plan
// against.
func (c Config) reservedForOthers(class Class) float64 {
	var total float64
	for _, f := range c.Floors {
		if f.Class != class {
			total += f.Floor
		}
	}
	return total
}

// belowFloor reports whether a class has had less than its floor's share of
// recent hand-offs, which is when it is owed a place rather than merely wanting
// one.
func (c Config) belowFloor(class Class, handedOut map[Class]int) bool {
	total := 0
	for _, count := range handedOut {
		total += count
	}
	if total == 0 {
		return true
	}
	share := float64(handedOut[class]) / float64(total)
	return share < c.floorShare(class)
}

// floorShare is a class's floor as a fraction of all the floors, which is the
// slice it keeps once the bank is too low for any floor to be met.
func (c Config) floorShare(class Class) float64 {
	var total float64
	for _, f := range c.Floors {
		total += f.Floor
	}
	if total <= 0 {
		return 1
	}
	return c.Floor(class) / total
}

// floorsSpec renders the floors for the reserve script as "class:floor,…", so it
// can work out what each class is still owed.
func (c Config) floorsSpec() string {
	var b strings.Builder
	for i, f := range c.Floors {
		if i > 0 {
			b.WriteByte(',')
		}
		fmt.Fprintf(&b, "%d:%g", uint8(f.Class), f.Floor)
	}
	return b.String()
}

// PolicyFor returns the first policy whose pattern matches path, and whether one
// did. An unmatched path takes the zero policy.
func (c Config) PolicyFor(path string) (EndpointPolicy, bool) {
	clean := path
	if idx := strings.IndexByte(clean, '?'); idx >= 0 {
		clean = clean[:idx]
	}
	for _, e := range c.Endpoints {
		if matchTemplate(e.Pattern, clean) {
			return e, true
		}
	}
	return EndpointPolicy{}, false
}

// matchTemplate compares a path against a template whose {} segments match any
// single segment.
func matchTemplate(pattern, path string) bool {
	patternSegs := strings.Split(strings.Trim(pattern, "/"), "/")
	pathSegs := strings.Split(strings.Trim(path, "/"), "/")
	if len(patternSegs) != len(pathSegs) {
		return false
	}
	for i, seg := range patternSegs {
		if strings.HasPrefix(seg, "{") && strings.HasSuffix(seg, "}") {
			if pathSegs[i] == "" {
				return false
			}
			continue
		}
		if seg != pathSegs[i] {
			return false
		}
	}
	return true
}
