package telemetry

import (
	"errors"
	"testing"

	"go.opentelemetry.io/otel"
	sdkmetric "go.opentelemetry.io/otel/sdk/metric"
	"go.opentelemetry.io/otel/sdk/metric/metricdata"
)

func TestMeterUsesRepoScopePrefix(t *testing.T) {
	reader := sdkmetric.NewManualReader()
	otel.SetMeterProvider(sdkmetric.NewMeterProvider(sdkmetric.WithReader(reader)))

	c := Must(Meter("worker").Int64Counter("scope.test_total"))
	c.Add(t.Context(), 1)

	var rm metricdata.ResourceMetrics
	if err := reader.Collect(t.Context(), &rm); err != nil {
		t.Fatal(err)
	}
	for _, sm := range rm.ScopeMetrics {
		if sm.Scope.Name == "eve-industry-planner/worker" {
			return
		}
	}
	t.Fatalf("scope not found in %#v", rm.ScopeMetrics)
}

func TestMustPanicsOnRegistrationFailure(t *testing.T) {
	defer func() {
		if recover() == nil {
			t.Fatal("expected panic")
		}
	}()
	Must(0, errors.New("bad instrument"))
}
