package main

import (
	"context"
	"errors"
	"io"
	"log"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
	"sync"
	"sync/atomic"

	"github.com/redis/go-redis/v9"
)

type Router struct {
	cfg config
	rdb *redis.Client
	be  *backendRegistry

	activeProxies atomic.Int64
	upgrades      atomic.Uint64
	placeHit      atomic.Uint64
	placeMiss     atomic.Uint64
	placeReassign atomic.Uint64
	placePin      atomic.Uint64
	placeCordon   atomic.Uint64
	placeFull     atomic.Uint64
	stickyFB      atomic.Uint64
	redisErr      atomic.Uint64
	proxyErr      atomic.Uint64

	loadMu sync.Mutex
	load   map[string]int64 // slot → active upgrades through this router
}

func (r *Router) handleMetrics(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "text/plain; version=0.0.4")
	_, _ = io.WriteString(w, "# HELP eip_ws_router_upgrades_total WebSocket upgrade attempts\n")
	_, _ = io.WriteString(w, "# TYPE eip_ws_router_upgrades_total counter\n")
	_, _ = io.WriteString(w, metricLine("eip_ws_router_upgrades_total", r.upgrades.Load()))
	_, _ = io.WriteString(w, metricLine("eip_ws_router_placement_hit_total", r.placeHit.Load()))
	_, _ = io.WriteString(w, metricLine("eip_ws_router_placement_miss_total", r.placeMiss.Load()))
	_, _ = io.WriteString(w, metricLine("eip_ws_router_placement_reassign_total", r.placeReassign.Load()))
	_, _ = io.WriteString(w, metricLine("eip_ws_router_placement_pin_total", r.placePin.Load()))
	_, _ = io.WriteString(w, metricLine("eip_ws_router_placement_cordon_skip_total", r.placeCordon.Load()))
	_, _ = io.WriteString(w, metricLine("eip_ws_router_placement_full_skip_total", r.placeFull.Load()))
	_, _ = io.WriteString(w, metricLine("eip_ws_router_sticky_fallback_total", r.stickyFB.Load()))
	_, _ = io.WriteString(w, metricLine("eip_ws_router_redis_error_total", r.redisErr.Load()))
	_, _ = io.WriteString(w, metricLine("eip_ws_router_proxy_error_total", r.proxyErr.Load()))
	_, _ = io.WriteString(w, "# TYPE eip_ws_router_active_proxies gauge\n")
	_, _ = io.WriteString(w, metricLine("eip_ws_router_active_proxies", uint64(r.activeProxies.Load())))
	_, _ = io.WriteString(w, "# TYPE eip_ws_router_backend_slots gauge\n")
	_, _ = io.WriteString(w, metricLine("eip_ws_router_backend_slots", uint64(r.be.count())))
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
	slot, setSticky, err := r.resolveSlot(ctx, req)
	if err != nil {
		r.proxyErr.Add(1)
		http.Error(w, "no backend available", http.StatusBadGateway)
		return
	}
	be, ok := r.be.get(slot)
	if !ok {
		r.proxyErr.Add(1)
		http.Error(w, "backend gone", http.StatusBadGateway)
		return
	}
	if setSticky {
		http.SetCookie(w, &http.Cookie{
			Name:     r.cfg.StickyCookie,
			Value:    slot,
			Path:     "/",
			HttpOnly: true,
			SameSite: http.SameSiteLaxMode,
		})
	}

	target := &url.URL{Scheme: "http", Host: net.JoinHostPort(be.IP, r.cfg.BackendPort)}
	proxy := httputil.NewSingleHostReverseProxy(target)
	proxy.FlushInterval = -1
	proxy.ErrorHandler = func(rw http.ResponseWriter, _ *http.Request, e error) {
		r.proxyErr.Add(1)
		log.Printf("proxy error slot=%s: %v", slot, e)
		http.Error(rw, "backend proxy error", http.StatusBadGateway)
	}
	r.incLoad(slot, 1)
	r.activeProxies.Add(1)
	defer func() {
		r.incLoad(slot, -1)
		r.activeProxies.Add(-1)
	}()
	proxy.ServeHTTP(w, req)
}

func (r *Router) resolveSlot(ctx context.Context, req *http.Request) (slot string, setSticky bool, err error) {
	ready := r.be.sortedSlots()
	if len(ready) == 0 {
		return "", false, errors.New("no backends")
	}

	cordoned := map[string]bool{}
	full := map[string]bool{}
	soft := map[string]bool{}
	redisUp := r.redisOK(ctx)
	if redisUp {
		cordoned = r.loadCordoned(ctx, ready)
		full = r.loadFull(ctx, ready)
		soft = r.loadSoft(ctx, ready)
	}
	// Soft does not affect eligibility (only new-home pick order).
	eligible := eligibleSlots(ready, mergeSkip(cordoned, full))
	versionOf := func(s string) string {
		if be, ok := r.be.get(s); ok {
			return be.AppVersion
		}
		return ""
	}
	// Prefer newest bake among eligible so reconnects shuffle onto NEW during a
	// Swarm roll. OLD SPA clients may use NEW slots (no exact-match gate).
	preferred := preferNewestSlots(eligible, versionOf)
	pickFrom := preferNonSoftSlots(preferred, soft)

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

	if aff != "" && redisUp {
		// Ops pin wins when the pinned slot is still eligible (not cordoned/full / still up).
		// Pin ignores soft (eligible-only check; soft is not a skip).
		if pin, perr := r.getPin(ctx, aff); perr == nil && pin != "" {
			if _, ok := eligibleSet[pin]; ok {
				r.placePin.Add(1)
				if serr := r.setPlacement(ctx, aff, pin); serr != nil {
					r.redisErr.Add(1)
					log.Printf("redis set placement (pin): %v", serr)
				}
				return pin, false, nil
			}
		} else if perr != nil && !errors.Is(perr, redis.Nil) {
			r.redisErr.Add(1)
			log.Printf("redis get pin: %v", perr)
		}

		placed, gerr := r.getPlacement(ctx, aff)
		if gerr != nil && !errors.Is(gerr, redis.Nil) {
			r.redisErr.Add(1)
			log.Printf("redis get placement: %v", gerr)
			return r.stickyFallback(req, preferred, preferredSet, pickFrom)
		}
		if placed != "" {
			// Place hit sticks even when the home slot is soft.
			if _, ok := preferredSet[placed]; ok {
				r.placeHit.Add(1)
				r.touchPlacement(ctx, aff)
				return placed, false, nil
			}
			// Eligible but not newest (or dead/cordoned/full) → reassign onto NEW.
			if _, ok := eligibleSet[placed]; ok {
				r.placeReassign.Add(1)
			} else {
				if cordoned[placed] {
					r.placeCordon.Add(1)
				}
				if full[placed] {
					r.placeFull.Add(1)
				}
				r.placeReassign.Add(1)
			}
		} else {
			r.placeMiss.Add(1)
		}
		slot = r.pickSlot(pickFrom)
		if serr := r.setPlacement(ctx, aff, slot); serr != nil {
			r.redisErr.Add(1)
			log.Printf("redis set placement: %v", serr)
		}
		return slot, false, nil
	}
	if aff != "" && !redisUp {
		r.redisErr.Add(1)
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
	return r.pickSlot(pickFrom), true, nil
}

func (r *Router) pickSlot(ready []string) string {
	if len(ready) == 0 {
		return ""
	}
	r.loadMu.Lock()
	defer r.loadMu.Unlock()
	if r.load == nil {
		r.load = map[string]int64{}
	}
	best := ready[0]
	bestN := r.load[best]
	for _, s := range ready[1:] {
		n := r.load[s]
		if n < bestN {
			best, bestN = s, n
		}
	}
	return best
}

func (r *Router) incLoad(slot string, delta int64) {
	r.loadMu.Lock()
	defer r.loadMu.Unlock()
	if r.load == nil {
		r.load = map[string]int64{}
	}
	r.load[slot] += delta
	if r.load[slot] <= 0 {
		delete(r.load, slot)
	}
}
