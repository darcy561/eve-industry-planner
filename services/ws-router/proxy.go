package main

import (
	"context"
	"errors"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync/atomic"

	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/trace"

	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/telemetry"

	"eve-industry-planner/shared/telemetry/wsroutermetrics"
	"go.opentelemetry.io/otel"
)

var routerTracer = telemetry.Tracer("ws-router")

type Router struct {
	cfg   config
	be    *backendRegistry
	place *placementStore

	activeProxies atomic.Int64
	upgrades      atomic.Uint64
	placeHit      atomic.Uint64
	placeMiss     atomic.Uint64
	placeReassign atomic.Uint64
	placeFull     atomic.Uint64
	placeDrain    atomic.Uint64
	stickyFB      atomic.Uint64
	proxyErr      atomic.Uint64
}

// snapshot reads the running totals for [wsroutermetrics.Register].
func (r *Router) snapshot() wsroutermetrics.Placement {
	return wsroutermetrics.Placement{
		Upgrades:        r.upgrades.Load(),
		Hits:            r.placeHit.Load(),
		Misses:          r.placeMiss.Load(),
		Reassignments:   r.placeReassign.Load(),
		StickyFallbacks: r.stickyFB.Load(),
		SkippedFull:     r.placeFull.Load(),
		SkippedDraining: r.placeDrain.Load(),
		ProxyErrors:     r.proxyErr.Load(),
		ActiveProxies:   r.activeProxies.Load(),
	}
}

func (r *Router) handleProxy(w http.ResponseWriter, req *http.Request) {
	if !strings.HasPrefix(req.URL.Path, "/ws") {
		http.NotFound(w, req)
		return
	}
	r.upgrades.Add(1)
	// Continue whatever trace reached the edge: Traefik and the browser both propagate W3C
	// traceparent, and the span ends at the upgrade rather than covering the connection's life.
	ctx := otel.GetTextMapPropagator().Extract(req.Context(), propagation.HeaderCarrier(req.Header))
	ctx, span := routerTracer.Start(ctx, req.Method+" /ws", trace.WithSpanKind(trace.SpanKindServer))
	defer span.End()
	req = req.WithContext(ctx)

	id, setSticky, result, err := r.resolveBackend(ctx, req)
	span.SetAttributes(
		attribute.String("wsrouter.placement.result", result),
		attribute.Bool("wsrouter.sticky.cookie_set", setSticky),
	)
	if err != nil {
		r.proxyErr.Add(1)
		http.Error(w, "no backend available", http.StatusBadGateway)
		return
	}
	span.SetAttributes(attribute.String("wsrouter.backend.container_id", id))
	be, ok := r.be.get(id)
	if !ok {
		r.proxyErr.Add(1)
		http.Error(w, "backend gone", http.StatusBadGateway)
		return
	}
	if setSticky {
		http.SetCookie(w, &http.Cookie{
			Name:     r.cfg.StickyCookie,
			Value:    id,
			Path:     "/",
			HttpOnly: true,
			SameSite: http.SameSiteLaxMode,
		})
	}

	target := &url.URL{Scheme: "http", Host: net.JoinHostPort(be.IP, r.cfg.BackendPort)}
	r.activeProxies.Add(1)
	defer r.activeProxies.Add(-1)
	if err := proxyWebSocketUpgrade(w, req, target); err != nil {
		r.proxyErr.Add(1)
		logs.WarnCtx(req.Context(), "ws-router: proxy error", "container_id", id, "error", err)
		if !errors.Is(err, errProxyClientWritten) {
			http.Error(w, "backend proxy error", http.StatusBadGateway)
		}
	}
}

// resolveBackend picks the backend for an upgrade and reports which path chose it, so the span
// and the metrics agree on why a client landed where it did.
func (r *Router) resolveBackend(_ context.Context, req *http.Request) (id string, setSticky bool, result string, err error) {
	ready := r.be.sortedIDs()
	if len(ready) == 0 {
		return "", false, "no_backends", errors.New("no backends")
	}

	full := r.place.loadFull(ready)
	draining := r.place.loadDraining(ready)
	soft := r.place.loadSoft(ready)
	// Soft does not affect eligibility (only new-home pick order).
	eligible := eligibleIDs(ready, mergeSkip(full, draining))
	versionOf := func(s string) string {
		if be, ok := r.be.get(s); ok {
			return be.AppVersion
		}
		return ""
	}
	// Prefer newest bake among eligible so reconnects shuffle onto NEW during a
	// Swarm roll. OLD SPA clients may use NEW backends (no exact-match gate).
	preferred := preferNewest(eligible, versionOf)
	pickFrom := preferNonSoft(preferred, soft)

	eligibleSet := map[string]struct{}{}
	for _, s := range eligible {
		eligibleSet[s] = struct{}{}
	}
	preferredSet := map[string]struct{}{}
	for _, s := range preferred {
		preferredSet[s] = struct{}{}
	}

	aff := ""
	if c, cerr := req.Cookie(r.cfg.AffinityCookie); cerr == nil && c != nil {
		aff = strings.TrimSpace(c.Value)
	}

	if aff != "" {
		reassigned := false
		if placed, ok := r.place.getPlace(aff); ok {
			// Place hit sticks even when the home backend is soft.
			if _, ok := preferredSet[placed]; ok {
				r.placeHit.Add(1)
				return placed, false, "hit", nil
			}
			// Stale place (dead/full/draining/old bake) → reassign onto preferred.
			if _, ok := eligibleSet[placed]; !ok {
				if full[placed] {
					r.placeFull.Add(1)
				}
				if draining[placed] {
					r.placeDrain.Add(1)
				}
			}
			r.placeReassign.Add(1)
			reassigned = true
		} else {
			r.placeMiss.Add(1)
		}
		id = r.pickBackend(pickFrom)
		if id == "" {
			return "", false, "no_pick", errors.New("no backend pick")
		}
		r.place.setPlace(aff, id)
		if reassigned {
			return id, false, "reassigned", nil
		}
		return id, false, "miss", nil
	}
	return r.stickyFallback(req, preferred, preferredSet, pickFrom)
}

func (r *Router) stickyFallback(req *http.Request, preferred []string, preferredSet map[string]struct{}, pickFrom []string) (string, bool, string, error) {
	r.stickyFB.Add(1)
	if c, err := req.Cookie(r.cfg.StickyCookie); err == nil && c != nil {
		v := strings.TrimSpace(c.Value)
		if _, ok := preferredSet[v]; ok {
			return v, false, "sticky_cookie", nil
		}
	}
	if len(pickFrom) == 0 {
		pickFrom = preferred
	}
	id := r.pickBackend(pickFrom)
	if id == "" {
		return "", false, "no_pick", errors.New("no backend pick")
	}
	return id, true, "sticky_new", nil
}

// pickBackend chooses the backend with the lowest live client count among ready.
// Ties break by container id (stable sort key).
func (r *Router) pickBackend(ready []string) string {
	if len(ready) == 0 {
		return ""
	}
	best := ready[0]
	bestN := r.place.clientsOf(best)
	for _, s := range ready[1:] {
		n := r.place.clientsOf(s)
		if n < bestN || (n == bestN && s < best) {
			best, bestN = s, n
		}
	}
	return best
}
