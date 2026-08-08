package main

import (
	"fmt"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

// stats aggregates soak counters for the final report.
type stats struct {
	DialOK           atomic.Uint64
	DialRefuse       atomic.Uint64 // HTTP refuse (401/503/…)
	DialErr          atomic.Uint64 // network / other dial failure
	ConnectedOK      atomic.Uint64
	PleaseReconnect  atomic.Uint64
	CloseUnexpected  atomic.Uint64
	ReconnectAttempt atomic.Uint64
	ReconnectOK      atomic.Uint64

	refuseByStatus sync.Map // int status -> *atomic.Uint64
	slotHits       sync.Map // container id (sticky or connected) -> *atomic.Uint64

	// limits: affinity → container id (from connected.container_id)
	affinityPlace sync.Map // string → string
	// limits: cohort|container_id → count
	cohortSlots sync.Map // string → *atomic.Uint64

	live atomic.Int64

	startedAt time.Time
}

func newStats() *stats {
	return &stats{startedAt: time.Now()}
}

func (s *stats) incRefuse(status int) {
	s.DialRefuse.Add(1)
	v, _ := s.refuseByStatus.LoadOrStore(status, &atomic.Uint64{})
	v.(*atomic.Uint64).Add(1)
}

func (s *stats) refuseStatus(status int) uint64 {
	v, ok := s.refuseByStatus.Load(status)
	if !ok {
		return 0
	}
	return v.(*atomic.Uint64).Load()
}

func (s *stats) incSlot(slot string) {
	slot = strings.TrimSpace(slot)
	if slot == "" {
		return
	}
	v, _ := s.slotHits.LoadOrStore(slot, &atomic.Uint64{})
	v.(*atomic.Uint64).Add(1)
}

func (s *stats) placeCountsFromAffinity() map[string]int64 {
	out := map[string]int64{}
	s.affinityPlace.Range(func(_, v any) bool {
		slot, _ := v.(string)
		slot = strings.TrimSpace(slot)
		if slot == "" {
			return true
		}
		out[slot]++
		return true
	})
	return out
}

func (s *stats) recordAffinityPlace(cohort cohortKind, affinity, slot string) {
	affinity = strings.TrimSpace(affinity)
	slot = strings.TrimSpace(slot)
	if affinity == "" || slot == "" {
		return
	}
	s.affinityPlace.Store(affinity, slot)
	key := string(cohort) + "|" + slot
	v, _ := s.cohortSlots.LoadOrStore(key, &atomic.Uint64{})
	v.(*atomic.Uint64).Add(1)
	s.incSlot(slot)
}

func (s *stats) cohortSlotCounts(cohort cohortKind) map[string]uint64 {
	prefix := string(cohort) + "|"
	out := map[string]uint64{}
	s.cohortSlots.Range(func(k, v any) bool {
		key, _ := k.(string)
		if !strings.HasPrefix(key, prefix) {
			return true
		}
		out[strings.TrimPrefix(key, prefix)] = v.(*atomic.Uint64).Load()
		return true
	})
	return out
}

func countOnOff(slotCounts map[string]uint64, blocked []string) (on, off, total int) {
	block := map[string]bool{}
	for _, s := range blocked {
		block[s] = true
	}
	for slot, n := range slotCounts {
		total += int(n)
		if block[slot] {
			on += int(n)
		} else {
			off += int(n)
		}
	}
	return on, off, total
}

func mapCounts(m *sync.Map) map[string]uint64 {
	out := map[string]uint64{}
	m.Range(func(k, v any) bool {
		switch key := k.(type) {
		case string:
			out[key] = v.(*atomic.Uint64).Load()
		case int:
			out[fmt.Sprintf("%d", key)] = v.(*atomic.Uint64).Load()
		}
		return true
	})
	return out
}

func formatCounts(counts map[string]uint64) string {
	if len(counts) == 0 {
		return "(none)"
	}
	keys := make([]string, 0, len(counts))
	for k := range counts {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	parts := make([]string, 0, len(keys))
	for _, k := range keys {
		parts = append(parts, fmt.Sprintf("%s=%d", k, counts[k]))
	}
	return strings.Join(parts, " ")
}

func (s *stats) snapshotLine(prefix string) string {
	elapsed := time.Since(s.startedAt).Truncate(time.Second)
	return fmt.Sprintf(
		"%s elapsed=%s live=%d dial_ok=%d connected=%d please_reconnect=%d reconnect_ok=%d dial_refuse=%d dial_err=%d close_unexpected=%d sticky=[%s]",
		prefix,
		elapsed,
		s.live.Load(),
		s.DialOK.Load(),
		s.ConnectedOK.Load(),
		s.PleaseReconnect.Load(),
		s.ReconnectOK.Load(),
		s.DialRefuse.Load(),
		s.DialErr.Load(),
		s.CloseUnexpected.Load(),
		formatCounts(mapCounts(&s.slotHits)),
	)
}

func (s *stats) finalReport(softKeys, fullKeys []string, placeCounts map[string]int64) string {
	var b strings.Builder
	b.WriteString("=== ws_soak report ===\n")
	b.WriteString(s.snapshotLine("summary") + "\n")
	b.WriteString(fmt.Sprintf("refuse_by_status: %s\n", formatCounts(mapCounts(&s.refuseByStatus))))
	b.WriteString(fmt.Sprintf("sticky_slots:     %s\n", formatCounts(mapCounts(&s.slotHits))))
	placeU := map[string]uint64{}
	for k, v := range placeCounts {
		placeU[k] = uint64(v)
	}
	b.WriteString(fmt.Sprintf("place_homes:      %s\n", formatCounts(placeU)))
	b.WriteString(fmt.Sprintf("nats_soft:        %s\n", joinOrNone(softKeys)))
	b.WriteString(fmt.Sprintf("nats_full:        %s\n", joinOrNone(fullKeys)))
	return b.String()
}

func joinOrNone(items []string) string {
	if len(items) == 0 {
		return "(none)"
	}
	sort.Strings(items)
	return strings.Join(items, " ")
}

// dropRate returns unexpected closes / successful dials (0 when no dials).
func (s *stats) dropRate() float64 {
	ok := s.DialOK.Load()
	if ok == 0 {
		return 1
	}
	return float64(s.CloseUnexpected.Load()) / float64(ok)
}
