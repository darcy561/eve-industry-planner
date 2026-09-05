package server

import (
	"testing"

	"go.opentelemetry.io/otel"
	sdkmetric "go.opentelemetry.io/otel/sdk/metric"
	"go.opentelemetry.io/otel/sdk/metric/metricdata"
)

func TestPlacementGaugesReportFlagsAndThresholds(t *testing.T) {
	t.Setenv("WS_TARGET_CLIENTS", "40")
	t.Setenv("WS_CLIENT_CUTOFF", "60")

	reader := sdkmetric.NewManualReader()
	otel.SetMeterProvider(sdkmetric.NewMeterProvider(sdkmetric.WithReader(reader)))

	s := &Server{}
	s.plannedCordon.Store(true)
	s.registerPlacementGauges()

	var rm metricdata.ResourceMetrics
	if err := reader.Collect(t.Context(), &rm); err != nil {
		t.Fatal(err)
	}

	flags := map[string]int64{}
	thresholds := map[string]int64{}
	for _, sm := range rm.ScopeMetrics {
		for _, m := range sm.Metrics {
			g, ok := m.Data.(metricdata.Gauge[int64])
			if !ok {
				continue
			}
			for _, dp := range g.DataPoints {
				if v, has := dp.Attributes.Value("flag"); has {
					flags[v.AsString()] = dp.Value
					continue
				}
				thresholds[m.Name] = dp.Value
			}
		}
	}

	if flags["cordoned"] != 1 {
		t.Fatalf("cordoned=%d want 1", flags["cordoned"])
	}
	for _, name := range []string{"draining", "soft", "full"} {
		if flags[name] != 0 {
			t.Fatalf("%s=%d want 0", name, flags[name])
		}
	}
	if thresholds["ws.placement.target_clients"] != 40 || thresholds["ws.placement.client_cutoff"] != 60 {
		t.Fatalf("thresholds %#v", thresholds)
	}
}
