package wsroutermetrics

import (
	"context"
	"testing"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/sdk/metric"
	"go.opentelemetry.io/otel/sdk/metric/metricdata"
)

func TestRegisterReportsPlacementByResult(t *testing.T) {
	reader := metric.NewManualReader()
	otel.SetMeterProvider(metric.NewMeterProvider(metric.WithReader(reader)))

	if err := Register(func() Placement {
		return Placement{Upgrades: 7, Hits: 4, Misses: 2, Reassignments: 1, StickyFallbacks: 3, SkippedFull: 1, ProxyErrors: 5, ActiveProxies: 2}
	}); err != nil {
		t.Fatal(err)
	}

	var rm metricdata.ResourceMetrics
	if err := reader.Collect(context.Background(), &rm); err != nil {
		t.Fatal(err)
	}

	byName := map[string]metricdata.Aggregation{}
	for _, s := range rm.ScopeMetrics {
		for _, m := range s.Metrics {
			byName[m.Name] = m.Data
		}
	}
	for _, want := range []string{"wsrouter.upgrades_total", "wsrouter.placement_decisions_total", "wsrouter.placement_home_skipped_total", "wsrouter.proxy_errors_total", "wsrouter.active_proxies"} {
		if _, ok := byName[want]; !ok {
			t.Fatalf("missing instrument %q", want)
		}
	}

	decisions, ok := byName["wsrouter.placement_decisions_total"].(metricdata.Sum[int64])
	if !ok {
		t.Fatalf("decisions aggregation %T", byName["wsrouter.placement_decisions_total"])
	}
	got := map[string]int64{}
	for _, dp := range decisions.DataPoints {
		v, _ := dp.Attributes.Value("result")
		got[v.AsString()] = dp.Value
	}
	for result, want := range map[string]int64{"hit": 4, "miss": 2, "reassigned": 1, "sticky_fallback": 3} {
		if got[result] != want {
			t.Fatalf("result %q = %d, want %d", result, got[result], want)
		}
	}
}
