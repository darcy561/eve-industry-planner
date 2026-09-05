// Package wsroutermetrics registers OpenTelemetry metrics for ws-router placement decisions.
package wsroutermetrics

import (
	"context"
	"fmt"

	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/metric"

	"eve-industry-planner/shared/telemetry"
)

// Placement is one reading of the router's running totals.
type Placement struct {
	Upgrades        uint64
	Hits            uint64
	Misses          uint64
	Reassignments   uint64
	StickyFallbacks uint64
	SkippedFull     uint64
	SkippedDraining uint64
	ProxyErrors     uint64
	ActiveProxies   int64
}

// Register installs observable instruments that call snapshot once per collection.
// The router owns the counters; this only reports them.
func Register(snapshot func() Placement) error {
	m := telemetry.Meter("ws-router")

	upgrades, err := m.Int64ObservableCounter("wsrouter.upgrades_total",
		metric.WithDescription("WebSocket upgrade attempts reaching the router"))
	if err != nil {
		return fmt.Errorf("wsroutermetrics: upgrades: %w", err)
	}
	decisions, err := m.Int64ObservableCounter("wsrouter.placement_decisions_total",
		metric.WithDescription("How each upgrade found its backend: an existing placement (hit), no placement yet (miss), a placement that was no longer usable (reassigned), or the sticky cookie path taken when the request carried no affinity cookie (sticky_fallback)"))
	if err != nil {
		return fmt.Errorf("wsroutermetrics: decisions: %w", err)
	}
	skipped, err := m.Int64ObservableCounter("wsrouter.placement_home_skipped_total",
		metric.WithDescription("Why a client's recorded home backend could not be reused"))
	if err != nil {
		return fmt.Errorf("wsroutermetrics: skipped: %w", err)
	}
	proxyErrors, err := m.Int64ObservableCounter("wsrouter.proxy_errors_total",
		metric.WithDescription("Upgrades that failed to reach or complete against a backend"))
	if err != nil {
		return fmt.Errorf("wsroutermetrics: proxy errors: %w", err)
	}
	active, err := m.Int64ObservableGauge("wsrouter.active_proxies",
		metric.WithDescription("Upgrades currently being proxied"))
	if err != nil {
		return fmt.Errorf("wsroutermetrics: active proxies: %w", err)
	}

	_, err = m.RegisterCallback(func(_ context.Context, o metric.Observer) error {
		p := snapshot()
		o.ObserveInt64(upgrades, int64(p.Upgrades))
		o.ObserveInt64(proxyErrors, int64(p.ProxyErrors))
		o.ObserveInt64(active, p.ActiveProxies)
		for result, v := range map[string]uint64{
			"hit":             p.Hits,
			"miss":            p.Misses,
			"reassigned":      p.Reassignments,
			"sticky_fallback": p.StickyFallbacks,
		} {
			o.ObserveInt64(decisions, int64(v), metric.WithAttributes(attribute.String("result", result)))
		}
		for reason, v := range map[string]uint64{
			"full":     p.SkippedFull,
			"draining": p.SkippedDraining,
		} {
			o.ObserveInt64(skipped, int64(v), metric.WithAttributes(attribute.String("reason", reason)))
		}
		return nil
	}, upgrades, decisions, skipped, proxyErrors, active)
	if err != nil {
		return fmt.Errorf("wsroutermetrics: register callback: %w", err)
	}
	return nil
}
