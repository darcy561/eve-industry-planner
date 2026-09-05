package esiclient_test

import (
	"net/http"
	"strings"
	"testing"
	"time"

	"eve-industry-planner/shared/esiclient"
)

func TestTokenCostMatchesTheProtocol(t *testing.T) {
	cases := []struct {
		status int
		want   int
		why    string
	}{
		{status: 200, want: 2, why: "a success costs two"},
		{status: 204, want: 2, why: "any 2xx costs two"},
		{status: 304, want: 1, why: "a conditional hit is half price, which is why validators matter"},
		{status: 404, want: 5, why: "a client error costs more than a success"},
		{status: 422, want: 5, why: "any other 4xx costs five"},
		{status: 429, want: 0, why: "a rate-limit response is excluded from the 4xx charge"},
		{status: 500, want: 0, why: "the server's fault is free"},
		{status: 503, want: 0, why: "any 5xx is free"},
	}

	for _, tc := range cases {
		if got := esiclient.TokenCost(tc.status); got != tc.want {
			t.Errorf("TokenCost(%d) = %d, want %d — %s", tc.status, got, tc.want, tc.why)
		}
	}
}

func TestCountsTowardErrorLimit(t *testing.T) {
	// The legacy limit counts non-2xx/3xx, which includes 5xx — so an outage
	// trips our own guard even though it costs no tokens.
	cases := map[int]bool{200: false, 304: false, 404: true, 429: true, 500: true, 503: true}
	for status, want := range cases {
		if got := esiclient.CountsTowardErrorLimit(status); got != want {
			t.Errorf("CountsTowardErrorLimit(%d) = %v, want %v", status, got, want)
		}
	}
}

func TestParseLimit(t *testing.T) {
	cases := []struct {
		header string
		tokens int
		window time.Duration
		ok     bool
	}{
		{header: "150/15m", tokens: 150, window: 15 * time.Minute, ok: true},
		{header: "12000/15m", tokens: 12000, window: 15 * time.Minute, ok: true},
		{header: " 600 / 15m ", tokens: 600, window: 15 * time.Minute, ok: true},
		{header: "100/1h", tokens: 100, window: time.Hour, ok: true},
		{header: "600", ok: false},
		{header: "600/", ok: false},
		{header: "abc/15m", ok: false},
		{header: "0/15m", ok: false},
		{header: "", ok: false},
	}

	for _, tc := range cases {
		tokens, window, ok := esiclient.ParseLimit(tc.header)
		if ok != tc.ok {
			t.Errorf("ParseLimit(%q) ok = %v, want %v", tc.header, ok, tc.ok)
			continue
		}
		if ok && (tokens != tc.tokens || window != tc.window) {
			t.Errorf("ParseLimit(%q) = %d/%v, want %d/%v", tc.header, tokens, window, tc.tokens, tc.window)
		}
	}
}

func TestBucketKeyingFollowsESI(t *testing.T) {
	anon := esiclient.BucketFor("market-order", esiclient.Identity{})
	if anon.User != esiclient.AnonymousUser {
		t.Errorf("unauthenticated user = %q, want the shared address bucket", anon.User)
	}

	named := esiclient.BucketFor("characters", esiclient.Identity{CharacterID: 91316135})
	if named.User == anon.User {
		t.Error("an authenticated call is metered per character, not per address")
	}
	if named.Key() != "characters|char:91316135" {
		t.Errorf("Key() = %q", named.Key())
	}

	other := esiclient.BucketFor("characters", esiclient.Identity{CharacterID: 12345})
	if other.Key() == named.Key() {
		t.Error("two characters must not share a bucket")
	}
	if !(esiclient.Bucket{}).Zero() {
		t.Error("an unnamed bucket should report itself as such")
	}
}

func TestEndpointPolicyFirstMatchWins(t *testing.T) {
	cfg := esiclient.Config{Endpoints: []esiclient.EndpointPolicy{
		{Pattern: "/markets/{region_id}/orders/", CompatibilityDate: "2025-12-16", MaxShare: 0.6},
		{Pattern: "/markets/{region_id}/{anything}/", CompatibilityDate: "2025-12-16", MaxShare: 0.1},
	}}

	policy, found := cfg.PolicyFor("/markets/10000002/orders/")
	if !found || policy.MaxShare != 0.6 {
		t.Errorf("first match should win: found=%v share=%v", found, policy.MaxShare)
	}

	policy, found = cfg.PolicyFor("/markets/10000002/history/")
	if !found || policy.MaxShare != 0.1 {
		t.Errorf("the general pattern should catch the rest: found=%v share=%v", found, policy.MaxShare)
	}

	if _, found := cfg.PolicyFor("/industry/systems/"); found {
		t.Error("an unlisted path should match nothing and take the zero policy")
	}
	if _, found := cfg.PolicyFor("/markets/10000002/orders/?page=2"); !found {
		t.Error("a query string should not stop a path matching its template")
	}
	if _, found := cfg.PolicyFor("/markets//orders/"); found {
		t.Error("an empty segment should not satisfy a placeholder")
	}
}

func TestEveryDefaultEndpointStatesACompatibilityDate(t *testing.T) {
	for _, policy := range esiclient.DefaultEndpointPolicies() {
		if policy.CompatibilityDate == "" {
			t.Errorf("%s has no compatibility date, so its response shape is unpinned", policy.Pattern)
		}
	}
}

func TestConfigValidation(t *testing.T) {
	if err := esiclient.DefaultConfig().Validate(); err != nil {
		t.Fatalf("the shipped defaults must be valid: %v", err)
	}

	over := esiclient.DefaultConfig()
	over.Floors = []esiclient.ClassFloor{
		{Class: esiclient.ClassBackground, Floor: 0.7},
		{Class: esiclient.ClassUserRequested, Floor: 0.7},
	}
	if err := over.Validate(); err == nil {
		t.Error("floors summing past the bucket should be rejected, not silently clipped")
	}

	undated := esiclient.DefaultConfig()
	undated.Endpoints = []esiclient.EndpointPolicy{{Pattern: "/x/"}}
	if err := undated.Validate(); err == nil {
		t.Error("an endpoint with no compatibility date should be rejected")
	}
}

func TestClassCapsCannotBreachAFloor(t *testing.T) {
	cfg := esiclient.DefaultConfig()

	var total float64
	for _, class := range []esiclient.Class{esiclient.ClassBackground, esiclient.ClassUserRequested} {
		cap := cfg.Cap(class)
		if cap < cfg.Floor(class) {
			t.Errorf("%s cap %.2f is below its own floor %.2f", class, cap, cfg.Floor(class))
		}
		total += cap
	}
	// If the caps could together exceed the bucket, two classes spending hard
	// would leave the third short of its guarantee.
	if total > 1.0001 {
		t.Errorf("class caps sum to %.3f; anything above 1 makes a floor a suggestion", total)
	}
}

func TestRateLimitErrorCarriesWhenToReturn(t *testing.T) {
	err := &esiclient.RateLimitError{
		Kind:       esiclient.KindDecelerating,
		RetryAfter: time.Now().Add(90 * time.Second),
		Bucket:     esiclient.BucketFor("market-order", esiclient.Identity{}),
		Reason:     "bucket low",
	}

	got, ok := esiclient.AsRateLimit(error(err))
	if !ok {
		t.Fatal("AsRateLimit should find it")
	}
	if got.Kind != esiclient.KindDecelerating {
		t.Errorf("Kind = %s", got.Kind)
	}
	if in := got.RetryIn(); in < 80*time.Second {
		t.Errorf("RetryIn = %v, want about 90s", in)
	}

	past := &esiclient.RateLimitError{RetryAfter: time.Now().Add(-time.Hour)}
	if past.RetryIn() != 0 {
		t.Errorf("RetryIn = %v on a past time, want 0", past.RetryIn())
	}
	if esiclient.IsRateLimit(http.ErrNotSupported) {
		t.Error("an unrelated error is not a rate limit")
	}
}

func TestStringsAreLegible(t *testing.T) {
	classes := map[esiclient.Class]string{
		esiclient.ClassBackground:    "background",
		esiclient.ClassUserRequested: "user",
	}
	for class, want := range classes {
		if got := class.String(); got != want {
			t.Errorf("Class(%d) = %q, want %q", class, got, want)
		}
	}

	kinds := map[esiclient.Kind]string{
		esiclient.KindQueued:       "queued",
		esiclient.KindDecelerating: "decelerating",
		esiclient.KindGated:        "gated",
		esiclient.KindErrorLimit:   "error_limit",
		esiclient.KindDowntime:     "downtime",
		esiclient.KindDiscovering:  "discovering",
	}
	for kind, want := range kinds {
		if got := kind.String(); got != want {
			t.Errorf("Kind(%d) = %q, want %q", kind, got, want)
		}
	}

	bucket := esiclient.BucketFor("market-order", esiclient.Identity{})
	if bucket.String() != bucket.Key() {
		t.Errorf("Bucket prints %q but keys on %q", bucket.String(), bucket.Key())
	}

	err := &esiclient.RateLimitError{
		Kind: esiclient.KindGated, Bucket: bucket,
		RetryAfter: time.Now().Add(time.Minute), Reason: "spent",
	}
	message := err.Error()
	for _, want := range []string{"gated", "market-order", "spent"} {
		if !strings.Contains(message, want) {
			t.Errorf("error message %q should name %q", message, want)
		}
	}
}
