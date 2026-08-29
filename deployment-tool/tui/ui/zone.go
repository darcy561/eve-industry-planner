package ui

import (
	"strconv"
	"strings"
	"sync"
	"time"

	tea "charm.land/bubbletea/v2"
	zone "github.com/lrstanley/bubblezone/v2"
)

// zoneTestMu serialises Mark/Scan/Hit against bubblezone's process-global manager.
// The live TUI is single-threaded; tests that Scan must LockZones/UnlockZones.
var zoneTestMu sync.Mutex

// LockZones / UnlockZones guard the global bubblezone manager for tests.
func LockZones()   { zoneTestMu.Lock() }
func UnlockZones() { zoneTestMu.Unlock() }

// WaitZoneReady polls until id is registered after Scan (async zone worker).
func WaitZoneReady(id string, timeout time.Duration) bool {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		z := zone.Get(id)
		if z != nil && !z.IsZero() {
			return true
		}
		time.Sleep(5 * time.Millisecond)
	}
	return false
}

// MouseClickAtZone returns a left-button release on the zone's top-left cell
// (bubblezone / Charm v2 treat release as the actionable click).
// Waits briefly for the async zone worker after Scan.
func MouseClickAtZone(id string) (tea.MouseReleaseMsg, bool) {
	if !WaitZoneReady(id, time.Second) {
		return tea.MouseReleaseMsg{}, false
	}
	z := zone.Get(id)
	if z == nil || z.IsZero() {
		return tea.MouseReleaseMsg{}, false
	}
	return tea.MouseReleaseMsg{X: z.StartX, Y: z.StartY, Button: tea.MouseLeft}, true
}

// MouseWheelAtZone returns a wheel event over the zone's top-left cell.
// Waits briefly for the async zone worker after Scan.
func MouseWheelAtZone(id string, up bool) (tea.MouseWheelMsg, bool) {
	if !WaitZoneReady(id, time.Second) {
		return tea.MouseWheelMsg{}, false
	}
	z := zone.Get(id)
	if z == nil || z.IsZero() {
		return tea.MouseWheelMsg{}, false
	}
	btn := tea.MouseWheelDown
	if up {
		btn = tea.MouseWheelUp
	}
	return tea.MouseWheelMsg{X: z.StartX, Y: z.StartY, Button: btn}, true
}

// Zone id SoT (no ad-hoc strings in Update switches).
const (
	ZonePaneOutput     = "pane.output"
	ZonePaneForm       = "pane.form"
	ZonePaneNav        = "pane.nav"
	ZoneCommandLine    = "cmdline"
	ZoneFinish           = "finish"
	ZoneBack             = "back"
	ZoneListRowPrefix    = "list.row."
	ZoneFormFieldPrefix  = "form.field."
)

func init() {
	zone.NewGlobal()
}

// Mark wraps content with a bubblezone id.
func Mark(id, s string) string { return zone.Mark(id, s) }

// Scan finalizes zone offsets for a full frame (call at program root View).
// Do not Scan already-scanned content (e.g. tea.View.Content): a second Scan
// with no markers issues a new iteration clear and drops prior zones.
func Scan(frame string) string { return zone.Scan(frame) }

// ZoneListRow is the id for list row i (menus, pickers, builder nav).
func ZoneListRow(i int) string {
	return ZoneListRowPrefix + strconv.Itoa(i)
}

// ZoneFormField is the id for builder form field i (bool / autogen / text).
func ZoneFormField(i int) string {
	return ZoneFormFieldPrefix + strconv.Itoa(i)
}

// ParseListRow returns the row index for a ZoneListRow id.
func ParseListRow(id string) (int, bool) {
	if !strings.HasPrefix(id, ZoneListRowPrefix) {
		return 0, false
	}
	n, err := strconv.Atoi(strings.TrimPrefix(id, ZoneListRowPrefix))
	return n, err == nil
}

// ParseFormField returns the field index for a ZoneFormField id.
func ParseFormField(id string) (int, bool) {
	if !strings.HasPrefix(id, ZoneFormFieldPrefix) {
		return 0, false
	}
	n, err := strconv.Atoi(strings.TrimPrefix(id, ZoneFormFieldPrefix))
	return n, err == nil
}

// HitListRow finds which list.row.N contains the mouse event.
func HitListRow(msg tea.MouseMsg, maxInclusive int) (row int, ok bool) {
	id, hit := HitPrefix(msg, ZoneListRowPrefix, maxInclusive)
	if !hit {
		return 0, false
	}
	return ParseListRow(id)
}

// Hit returns the first of ids whose zone contains the mouse event.
func Hit(msg tea.MouseMsg, ids ...string) (id string, ok bool) {
	for _, candidate := range ids {
		z := zone.Get(candidate)
		if z != nil && z.InBounds(msg) {
			return candidate, true
		}
	}
	return "", false
}

// HitPrefix probes prefix+0..maxInclusive for a containing zone.
// When several zones overlap (stale scans / nested marks), the smallest
// bounding box wins so a click lands on the tightest field, not a neighbour.
func HitPrefix(msg tea.MouseMsg, prefix string, maxInclusive int) (id string, ok bool) {
	best := ""
	bestArea := int(^uint(0) >> 1) // max int
	for i := 0; i <= maxInclusive; i++ {
		candidate := prefix + strconv.Itoa(i)
		z := zone.Get(candidate)
		if z == nil || z.IsZero() || !z.InBounds(msg) {
			continue
		}
		w := z.EndX - z.StartX + 1
		h := z.EndY - z.StartY + 1
		if w < 1 {
			w = 1
		}
		if h < 1 {
			h = 1
		}
		area := w * h
		if area < bestArea {
			bestArea = area
			best = candidate
		}
	}
	return best, best != ""
}

// WheelDir reports wheel direction for MouseWheelMsg.
func WheelDir(msg tea.Msg) (up bool, ok bool) {
	w, is := msg.(tea.MouseWheelMsg)
	if !is {
		return false, false
	}
	switch w.Button {
	case tea.MouseWheelUp:
		return true, true
	case tea.MouseWheelDown:
		return false, true
	default:
		return false, false
	}
}

// IsLeftClick reports a completed left-button click (MouseReleaseMsg).
// Charm v2 + bubblezone use release, not press — press-only handlers miss WT/host clicks.
func IsLeftClick(msg tea.Msg) (tea.MouseMsg, bool) {
	r, ok := msg.(tea.MouseReleaseMsg)
	if !ok || r.Button != tea.MouseLeft {
		return nil, false
	}
	return r, true
}
