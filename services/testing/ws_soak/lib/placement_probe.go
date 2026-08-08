package soaklib

import (
	"log"
	"sort"
	"strings"
	"sync"

	natscore "eve-industry-planner/shared/core/nats"

	natslib "github.com/nats-io/nats.go"
)

// placementWatcher tracks latest PlacementState per container from NATS.
type placementWatcher struct {
	mu   sync.RWMutex
	byID map[string]natscore.PlacementState
}

func newPlacementWatcher() *placementWatcher {
	return &placementWatcher{byID: map[string]natscore.PlacementState{}}
}

func (w *placementWatcher) applyMsg(msg *natslib.Msg) {
	if w == nil || msg == nil {
		return
	}
	state, err := natscore.ParsePlacementState(msg.Data)
	if err != nil {
		log.Printf("placement nats parse: %v", err)
		return
	}
	w.applyState(state)
}

func (w *placementWatcher) applyState(state natscore.PlacementState) {
	id := strings.TrimSpace(state.ContainerID)
	if w == nil || id == "" {
		return
	}
	w.mu.Lock()
	defer w.mu.Unlock()
	w.byID[id] = state
}

func (w *placementWatcher) softIDs() []string {
	return w.idsWhere(func(s natscore.PlacementState) bool { return s.Soft })
}

func (w *placementWatcher) fullIDs() []string {
	return w.idsWhere(func(s natscore.PlacementState) bool { return s.Full })
}

func (w *placementWatcher) idsWhere(match func(natscore.PlacementState) bool) []string {
	if w == nil {
		return nil
	}
	w.mu.RLock()
	defer w.mu.RUnlock()
	var out []string
	for id, st := range w.byID {
		if match(st) {
			out = append(out, id)
		}
	}
	sort.Strings(out)
	return out
}

func connectNATS() (*natslib.Conn, error) {
	return natscore.Connect()
}

func startPlacementWatch(nc *natslib.Conn) (*placementWatcher, error) {
	w := newPlacementWatcher()
	if nc == nil {
		return w, nil
	}
	if _, err := nc.Subscribe(natscore.SubjectWSPlacementState, w.applyMsg); err != nil {
		return nil, err
	}
	return w, nil
}

func uniqueSorted(ids []string) []string {
	seen := map[string]bool{}
	var out []string
	for _, id := range ids {
		id = strings.TrimSpace(id)
		if id == "" || seen[id] {
			continue
		}
		seen[id] = true
		out = append(out, id)
	}
	sort.Strings(out)
	return out
}
