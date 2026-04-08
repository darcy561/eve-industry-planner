package common

import (
	"sync"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/metric"
)

var coreMeter = sync.OnceValue(func() metric.Meter {
	return otel.Meter("eve-industry-planner/coreesi")
})

// Meter returns the shared core service OpenTelemetry meter.
func Meter() metric.Meter {
	return coreMeter()
}
