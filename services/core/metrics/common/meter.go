package common

import (
	"sync"

	"go.opentelemetry.io/otel/metric"

	"eve-industry-planner/shared/telemetry"
)

var coreMeter = sync.OnceValue(func() metric.Meter {
	return telemetry.Meter("coreesi")
})

// Meter returns the shared core service OpenTelemetry meter.
func Meter() metric.Meter {
	return coreMeter()
}
