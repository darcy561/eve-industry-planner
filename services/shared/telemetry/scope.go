package telemetry

import (
	"fmt"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/metric"
	"go.opentelemetry.io/otel/trace"
)

// scopePrefix names every instrumentation scope this repo registers, so a component passes
// "worker" rather than repeating the full string at each call site.
const scopePrefix = "eve-industry-planner/"

// Meter returns the meter for component, e.g. Meter("worker") for scope
// "eve-industry-planner/worker".
//
// Deliberately not memoised: [Init] installs the global provider after package init and tests swap
// it, so a cached meter can pin the noop one that was current at first use. The provider caches by
// scope name, which is what makes calling this per registration cheap.
func Meter(component string) metric.Meter {
	return otel.Meter(scopePrefix + component)
}

// Tracer returns the tracer for component. Same scope convention and same caching note as [Meter].
func Tracer(component string) trace.Tracer {
	return otel.Tracer(scopePrefix + component)
}

// Must returns instrument, panicking when the SDK refused to create it. A refusal means a malformed
// instrument name or unit, which is a programmer error fixed in the code rather than a runtime
// condition a caller could handle.
func Must[T any](instrument T, err error) T {
	if err != nil {
		panic(fmt.Sprintf("telemetry: %T: %v", instrument, err))
	}
	return instrument
}
