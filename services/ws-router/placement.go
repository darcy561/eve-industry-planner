package main

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"

	"eve-industry-planner/shared/logs"
	eipnats "eve-industry-planner/shared/nats"
	"eve-industry-planner/shared/wsplacement"

	natslib "github.com/nats-io/nats.go"
)

// placementFlags is the per-backend view used for eligibility and place-miss pick.
type placementFlags struct {
	clients  int
	soft     bool
	full     bool
	draining bool
}

// placementStore holds in-memory place (tenant → container_id) and per-backend flags.
type placementStore struct {
	mu    sync.RWMutex
	place map[string]string         // affinity key → container id
	byID  map[string]placementFlags // container id → load flags
}

func newPlacementStore() *placementStore {
	return &placementStore{
		place: map[string]string{},
		byID:  map[string]placementFlags{},
	}
}

func (p *placementStore) applyState(state eipnats.PlacementState) {
	id := strings.TrimSpace(state.ContainerID)
	if id == "" {
		return
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	p.byID[id] = placementFlags{
		clients:  max(state.Clients, 0),
		soft:     state.Soft,
		full:     state.Full,
		draining: state.Draining,
	}
}

func (p *placementStore) applyMsg(msg *natslib.Msg) {
	if msg == nil {
		return
	}
	state, err := eipnats.ParsePlacementState(msg.Data)
	if err != nil {
		logs.WarnCtx(context.Background(), "ws-router: placement state parse failed", "error", err)
		return
	}
	p.applyState(state)
}

func (p *placementStore) getPlace(key string) (string, bool) {
	p.mu.RLock()
	defer p.mu.RUnlock()
	id, ok := p.place[key]
	return id, ok && id != ""
}

func (p *placementStore) setPlace(key, backendID string) {
	key = strings.TrimSpace(key)
	backendID = strings.TrimSpace(backendID)
	if key == "" || backendID == "" {
		return
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	p.place[key] = backendID
}

func (p *placementStore) flagsOf(id string) placementFlags {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return p.byID[id]
}

func (p *placementStore) clientsOf(id string) int {
	return p.flagsOf(id).clients
}

func (p *placementStore) loadFull(ids []string) map[string]bool {
	out := map[string]bool{}
	if len(ids) == 0 {
		return out
	}
	p.mu.RLock()
	defer p.mu.RUnlock()
	for _, id := range ids {
		if p.byID[id].full {
			out[id] = true
		}
	}
	return out
}

func (p *placementStore) loadDraining(ids []string) map[string]bool {
	out := map[string]bool{}
	if len(ids) == 0 {
		return out
	}
	p.mu.RLock()
	defer p.mu.RUnlock()
	for _, id := range ids {
		if p.byID[id].draining {
			out[id] = true
		}
	}
	return out
}

func (p *placementStore) loadSoft(ids []string) map[string]bool {
	out := map[string]bool{}
	if len(ids) == 0 {
		return out
	}
	p.mu.RLock()
	defer p.mu.RUnlock()
	for _, id := range ids {
		if p.byID[id].soft {
			out[id] = true
		}
	}
	return out
}

// pruneUnknown drops flag rows for container ids no longer in ready.
func (p *placementStore) pruneUnknown(ready map[string]backend) {
	p.mu.Lock()
	defer p.mu.Unlock()
	for id := range p.byID {
		if _, ok := ready[id]; !ok {
			delete(p.byID, id)
		}
	}
}

// reconcileStatuses GETs /placement on each ready backend and replaces flag rows.
func (p *placementStore) reconcileStatuses(ctx context.Context, cfg config, httpClient *http.Client, ready map[string]backend) {
	if len(ready) == 0 {
		p.pruneUnknown(ready)
		return
	}
	type result struct {
		id    string // discovery container id (registry key)
		state eipnats.PlacementState
		ok    bool
	}
	ch := make(chan result, len(ready))
	var wg sync.WaitGroup
	for _, be := range ready {
		wg.Add(1)
		go func(be backend) {
			defer wg.Done()
			state, err := fetchPlacementStatus(ctx, httpClient, cfg.BackendPort, be)
			if err != nil {
				logs.WarnCtx(ctx, "ws-router: placement status reconcile failed", "container_id", be.ContainerID, "error", err)
				ch <- result{}
				return
			}
			if cid := strings.TrimSpace(state.ContainerID); cid != "" && cid != be.ContainerID {
				logs.WarnCtx(ctx, "ws-router: placement status container_id mismatch", "discovery_container_id", be.ContainerID, "body_container_id", cid)
			}
			ch <- result{id: be.ContainerID, state: state, ok: true}
		}(be)
	}
	wg.Wait()
	close(ch)

	p.mu.Lock()
	for id := range p.byID {
		if _, ok := ready[id]; !ok {
			delete(p.byID, id)
		}
	}
	for r := range ch {
		if !r.ok || r.id == "" {
			continue
		}
		p.byID[r.id] = placementFlags{
			clients:  max(r.state.Clients, 0),
			soft:     r.state.Soft,
			full:     r.state.Full,
			draining: r.state.Draining,
		}
	}
	p.mu.Unlock()
}

func fetchPlacementStatus(ctx context.Context, httpClient *http.Client, port string, be backend) (eipnats.PlacementState, error) {
	if be.IP == "" || port == "" {
		return eipnats.PlacementState{}, fmt.Errorf("missing ip or port")
	}
	host := be.IP
	if strings.Contains(be.IP, ":") && !strings.HasPrefix(be.IP, "[") {
		host = "[" + be.IP + "]"
	}
	u := fmt.Sprintf("http://%s:%s%s", host, port, wsplacement.StatusPath)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return eipnats.PlacementState{}, err
	}
	resp, err := httpClient.Do(req)
	if err != nil {
		return eipnats.PlacementState{}, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return eipnats.PlacementState{}, err
	}
	if resp.StatusCode != http.StatusOK {
		return eipnats.PlacementState{}, fmt.Errorf("%s: %s", u, resp.Status)
	}
	state, err := eipnats.ParsePlacementState(body)
	if err != nil {
		return eipnats.PlacementState{}, err
	}
	return state, nil
}

// eligibleIDs drops skipped backends (full and/or draining). If every backend is
// skipped, returns ready unchanged so /ws is not black-holed — process refuse
// still gates a few overs on a full backend (client_cutoff is an arbitrary operator number).
func eligibleIDs(ready []string, skip map[string]bool) []string {
	if len(ready) == 0 {
		return ready
	}
	out := make([]string, 0, len(ready))
	for _, s := range ready {
		if skip[s] {
			continue
		}
		out = append(out, s)
	}
	if len(out) == 0 {
		return ready
	}
	return out
}

// preferNewest keeps only backends whose bake equals the newest AppVersion
// among ready (semver X.Y.Z). Used so reconnects land on NEW during a Swarm
// roll instead of staying on OLD (avoids multi-hop as OLD tasks drain).
// If versions are missing / incomparable, returns ready unchanged.
func preferNewest(ready []string, versionOf func(id string) string) []string {
	if len(ready) == 0 {
		return ready
	}
	best := ""
	for _, s := range ready {
		v := strings.TrimSpace(versionOf(s))
		if v == "" {
			continue
		}
		if best == "" || compareSemverXYZ(v, best) > 0 {
			best = v
		}
	}
	if best == "" {
		return ready
	}
	out := make([]string, 0, len(ready))
	for _, s := range ready {
		if strings.TrimSpace(versionOf(s)) == best {
			out = append(out, s)
		}
	}
	if len(out) == 0 {
		return ready
	}
	return out
}

// compareSemverXYZ compares bare X.Y.Z strings. Returns -1/0/1. Non-numeric
// segments compare as 0. Empty a < non-empty b.
func compareSemverXYZ(a, b string) int {
	a, b = strings.TrimSpace(a), strings.TrimSpace(b)
	if a == b {
		return 0
	}
	if a == "" {
		return -1
	}
	if b == "" {
		return 1
	}
	as, bs := strings.Split(a, "."), strings.Split(b, ".")
	n := max(len(as), len(bs))
	for i := range n {
		var ai, bi int
		if i < len(as) {
			fmt.Sscanf(as[i], "%d", &ai)
		}
		if i < len(bs) {
			fmt.Sscanf(bs[i], "%d", &bi)
		}
		if ai < bi {
			return -1
		}
		if ai > bi {
			return 1
		}
	}
	return 0
}

// mergeSkip unions full + draining skip maps for eligibility.
// Soft is intentionally excluded — soft divert only affects new-home pick order.
func mergeSkip(full, draining map[string]bool) map[string]bool {
	out := map[string]bool{}
	for k, v := range full {
		if v {
			out[k] = true
		}
	}
	for k, v := range draining {
		if v {
			out[k] = true
		}
	}
	return out
}

// preferNonSoft keeps preferred backends that are not soft-marked. If every
// preferred backend is soft, returns preferred unchanged (all-soft fallback).
func preferNonSoft(preferred []string, soft map[string]bool) []string {
	if len(preferred) == 0 || len(soft) == 0 {
		return preferred
	}
	out := make([]string, 0, len(preferred))
	for _, s := range preferred {
		if soft[s] {
			continue
		}
		out = append(out, s)
	}
	if len(out) == 0 {
		return preferred
	}
	return out
}
