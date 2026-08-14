package main

import (
	"context"
	"errors"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync/atomic"
)

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

func (r *Router) handleMetrics(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "text/plain; version=0.0.4")
	_, _ = io.WriteString(w, "# HELP eip_ws_router_upgrades_total WebSocket upgrade attempts\n")
	_, _ = io.WriteString(w, "# TYPE eip_ws_router_upgrades_total counter\n")
	_, _ = io.WriteString(w, metricLine("eip_ws_router_upgrades_total", r.upgrades.Load()))
	_, _ = io.WriteString(w, metricLine("eip_ws_router_placement_hit_total", r.placeHit.Load()))
	_, _ = io.WriteString(w, metricLine("eip_ws_router_placement_miss_total", r.placeMiss.Load()))
	_, _ = io.WriteString(w, metricLine("eip_ws_router_placement_reassign_total", r.placeReassign.Load()))
	_, _ = io.WriteString(w, metricLine("eip_ws_router_placement_full_skip_total", r.placeFull.Load()))
	_, _ = io.WriteString(w, metricLine("eip_ws_router_placement_drain_skip_total", r.placeDrain.Load()))
	_, _ = io.WriteString(w, metricLine("eip_ws_router_sticky_fallback_total", r.stickyFB.Load()))
	_, _ = io.WriteString(w, metricLine("eip_ws_router_proxy_error_total", r.proxyErr.Load()))
	_, _ = io.WriteString(w, "# TYPE eip_ws_router_active_proxies gauge\n")
	_, _ = io.WriteString(w, metricLine("eip_ws_router_active_proxies", uint64(r.activeProxies.Load())))
	_, _ = io.WriteString(w, "# HELP ws_router_containers Running websocket containers known to the placement registry\n")
	_, _ = io.WriteString(w, "# TYPE ws_router_containers gauge\n")
	_, _ = io.WriteString(w, metricLine("ws_router_containers", uint64(r.be.count())))
}

func metricLine(name string, v uint64) string {
	return name + " " + itoa(v) + "\n"
}

func itoa(v uint64) string {
	if v == 0 {
		return "0"
	}
	var b [20]byte
	i := len(b)
	for v > 0 {
		i--
		b[i] = byte('0' + v%10)
		v /= 10
	}
	return string(b[i:])
}

func (r *Router) handleProxy(w http.ResponseWriter, req *http.Request) {
	if !strings.HasPrefix(req.URL.Path, "/ws") {
		http.NotFound(w, req)
		return
	}
	r.upgrades.Add(1)
	ctx := req.Context()
	id, setSticky, err := r.resolveBackend(ctx, req)
	if err != nil {
		r.proxyErr.Add(1)
		http.Error(w, "no backend available", http.StatusBadGateway)
		return
	}
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
		log.Printf("proxy error container_id=%s: %v", id, err)
		if !errors.Is(err, errProxyClientWritten) {
			http.Error(w, "backend proxy error", http.StatusBadGateway)
		}
	}
}

func (r *Router) resolveBackend(_ context.Context, req *http.Request) (id string, setSticky bool, err error) {
	ready := r.be.sortedIDs()
	if len(ready) == 0 {
		return "", false, errors.New("no backends")
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
		if placed, ok := r.place.getPlace(aff); ok {
			// Place hit sticks even when the home backend is soft.
			if _, ok := preferredSet[placed]; ok {
				r.placeHit.Add(1)
				return placed, false, nil
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
		} else {
			r.placeMiss.Add(1)
		}
		id = r.pickBackend(pickFrom)
		if id == "" {
			return "", false, errors.New("no backend pick")
		}
		r.place.setPlace(aff, id)
		return id, false, nil
	}
	return r.stickyFallback(req, preferred, preferredSet, pickFrom)
}

func (r *Router) stickyFallback(req *http.Request, preferred []string, preferredSet map[string]struct{}, pickFrom []string) (string, bool, error) {
	r.stickyFB.Add(1)
	if c, err := req.Cookie(r.cfg.StickyCookie); err == nil && c != nil {
		v := strings.TrimSpace(c.Value)
		if _, ok := preferredSet[v]; ok {
			return v, false, nil
		}
	}
	if len(pickFrom) == 0 {
		pickFrom = preferred
	}
	id := r.pickBackend(pickFrom)
	if id == "" {
		return "", false, errors.New("no backend pick")
	}
	return id, true, nil
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
