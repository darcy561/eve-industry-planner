package esiclient_test

import (
	"net/http"
	"os"
	"testing"
	"time"

	"eve-industry-planner/shared/esiclient"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	sdkmetric "go.opentelemetry.io/otel/sdk/metric"
	"go.opentelemetry.io/otel/sdk/metric/metricdata"
)

// The global meter provider binds an instrument to whichever provider was
// installed first, so a reader per test would only ever collect from the
// earliest one. One reader for the package, installed before any test runs.
// Delta temporality so each collect reports only what its own body did; a
// cumulative reader shared by the package would hand every test the sum of the
// ones before it.
var metricReader = sdkmetric.NewManualReader(
	sdkmetric.WithTemporalitySelector(func(sdkmetric.InstrumentKind) metricdata.Temporality {
		return metricdata.DeltaTemporality
	}),
)

func TestMain(m *testing.M) {
	otel.SetMeterProvider(sdkmetric.NewMeterProvider(sdkmetric.WithReader(metricReader)))
	os.Exit(m.Run())
}

// collect runs fn and returns everything recorded during it.
func collect(t *testing.T, fn func()) metricdata.ResourceMetrics {
	t.Helper()

	// Drain whatever earlier tests left behind.
	var discard metricdata.ResourceMetrics
	if err := metricReader.Collect(t.Context(), &discard); err != nil {
		t.Fatalf("drain: %v", err)
	}

	fn()

	var out metricdata.ResourceMetrics
	if err := metricReader.Collect(t.Context(), &out); err != nil {
		t.Fatalf("collect: %v", err)
	}
	return out
}

func findMetric(rm metricdata.ResourceMetrics, name string) (metricdata.Metrics, bool) {
	for _, scope := range rm.ScopeMetrics {
		for _, m := range scope.Metrics {
			if m.Name == name {
				return m, true
			}
		}
	}
	return metricdata.Metrics{}, false
}

func attrsOf(m metricdata.Metrics) []attribute.Set {
	var sets []attribute.Set
	switch data := m.Data.(type) {
	case metricdata.Sum[int64]:
		for _, dp := range data.DataPoints {
			sets = append(sets, dp.Attributes)
		}
	case metricdata.Gauge[int64]:
		for _, dp := range data.DataPoints {
			sets = append(sets, dp.Attributes)
		}
	case metricdata.Gauge[float64]:
		for _, dp := range data.DataPoints {
			sets = append(sets, dp.Attributes)
		}
	case metricdata.Histogram[float64]:
		for _, dp := range data.DataPoints {
			sets = append(sets, dp.Attributes)
		}
	case metricdata.Histogram[int64]:
		for _, dp := range data.DataPoints {
			sets = append(sets, dp.Attributes)
		}
	}
	return sets
}

func TestRequestsAndTokensAreRecorded(t *testing.T) {
	fake := newESIFake(t, 12000)

	rm := collect(t, func() {
		client := newClient(t, fake)
		if _, err := client.Do(t.Context(), ordersRequest); err != nil {
			t.Fatalf("Do: %v", err)
		}
	})

	for _, name := range []string{
		"esi.requests_total",
		"esi.tokens_spent_total",
		"esi.request_duration_milliseconds",
		"esi.queue_wait_milliseconds",
	} {
		if _, ok := findMetric(rm, name); !ok {
			t.Errorf("%s was not recorded", name)
		}
	}

	tokens, _ := findMetric(rm, "esi.tokens_spent_total")
	sum, ok := tokens.Data.(metricdata.Sum[int64])
	if !ok || len(sum.DataPoints) == 0 {
		t.Fatalf("tokens_spent_total = %T", tokens.Data)
	}
	if sum.DataPoints[0].Value != 2 {
		t.Errorf("tokens spent = %d, want the 2 a 2xx costs", sum.DataPoints[0].Value)
	}
}

func TestLabelsNeverCarryACharacterID(t *testing.T) {
	fake := newESIFake(t, 12000)

	rm := collect(t, func() {
		client := newClient(t, fake)
		req := ordersRequest
		req.Auth = esiclient.Identity{CharacterID: 91316135}
		if _, err := client.Do(t.Context(), req); err != nil {
			t.Fatalf("Do: %v", err)
		}
	})

	requests, ok := findMetric(rm, "esi.requests_total")
	if !ok {
		t.Fatal("esi.requests_total missing")
	}
	for _, set := range attrsOf(requests) {
		for _, kv := range set.ToSlice() {
			value := kv.Value.Emit()
			// A per-character label grows a new series per player.
			if value == "91316135" || value == "char:91316135" {
				t.Errorf("label %s=%q carries a character id", kv.Key, value)
			}
		}
		scope, present := set.Value("scope")
		if !present {
			t.Error("scope label missing; it is what replaces the character id")
			continue
		}
		if scope.Emit() != "character" {
			t.Errorf("scope = %q, want character for an authenticated call", scope.Emit())
		}
	}
}

func TestYieldsAreLabelledByReason(t *testing.T) {
	fake := newESIFake(t, 12000)

	rm := collect(t, func() {
		client := newClient(t, fake, func(c *esiclient.Config) {
			c.Mode = esiclient.ModeDirect
			c.Tolerance = map[esiclient.Class]time.Duration{esiclient.ClassBackground: 20 * time.Millisecond}
			c.Endpoints = []esiclient.EndpointPolicy{{
				Pattern:           "/markets/{region_id}/orders/",
				CompatibilityDate: "2025-12-16",
				MinSpacing:        time.Millisecond,
				Conditional:       true,
			}}
		})

		fake.setStatus(http.StatusTooManyRequests)
		if _, err := client.Do(t.Context(), ordersRequest); err != nil {
			t.Fatalf("the 429 is a response, not an error: %v", err)
		}
		// The bucket is gated now, so this one is turned away.
		_, _ = client.Do(t.Context(), ordersRequest)
	})

	if _, ok := findMetric(rm, "esi.gate_closures_total"); !ok {
		t.Error("a Retry-After should be counted; each one stops every replica")
	}

	yields, ok := findMetric(rm, "esi.yields_total")
	if !ok {
		t.Fatal("esi.yields_total missing")
	}
	var reasons []string
	for _, set := range attrsOf(yields) {
		if reason, present := set.Value("reason"); present {
			reasons = append(reasons, reason.Emit())
		}
	}
	if len(reasons) == 0 {
		t.Fatal("a yield was recorded with no reason label")
	}
	for _, reason := range reasons {
		if reason == "" {
			t.Error("empty reason label")
		}
	}
}

func TestAReplicaReportsItsQueueAndNotTheBucket(t *testing.T) {
	fake := newESIFake(t, 12000)

	rm := collect(t, func() {
		client := newClient(t, fake)
		if _, err := client.Do(t.Context(), ordersRequest); err != nil {
			t.Fatalf("Do: %v", err)
		}
		stop, err := esiclient.RegisterMetrics(client.Dispatcher())
		if err != nil {
			t.Fatalf("RegisterMetrics: %v", err)
		}
		t.Cleanup(func() { _ = stop() })
	})

	// A bucket belongs to the fleet, and every replica reads the same figures
	// from Redis. Reporting them here would emit one identical series per
	// replica, which a dashboard can wrongly sum. Core reports them once.
	for _, name := range []string{
		"esi.bucket.limit",
		"esi.bucket.spent",
		"esi.bucket.fill",
		"esi.bucket.gated",
	} {
		if _, ok := findMetric(rm, name); ok {
			t.Errorf("%s was reported per replica; bucket state belongs to core", name)
		}
	}
}

func TestSnapshotReportsQueueAndBucket(t *testing.T) {
	fake := newESIFake(t, 12000)
	client := newClient(t, fake)
	if _, err := client.Do(t.Context(), ordersRequest); err != nil {
		t.Fatalf("Do: %v", err)
	}

	snapshots := client.Dispatcher().Snapshot(t.Context())
	if len(snapshots) == 0 {
		t.Fatal("Snapshot reported nothing after a call")
	}

	var found bool
	for _, s := range snapshots {
		if s.Bucket.Group != "market-order" {
			continue
		}
		found = true
		if s.State.Limit != 12000 {
			t.Errorf("Limit = %d", s.State.Limit)
		}
		if fill := s.Fill(); fill <= 0 || fill > 1 {
			t.Errorf("Fill = %v, want a share between 0 and 1", fill)
		}
	}
	if !found {
		t.Errorf("no snapshot for the learned bucket: %+v", snapshots)
	}
}
