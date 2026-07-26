// Package ops builds the home command list from internal/catalog (SoT).
// Menu visibility is gated by status.Snapshot.Docker (chip light), not by
// listening to EIPMSG chip events directly.
package ops

import (
	"github.com/charmbracelet/bubbles/list"

	"eve-industry-planner/admintool/internal/catalog"
	"eve-industry-planner/admintool/tui/status"
	"eve-industry-planner/admintool/tui/ui"
)

// Special marks non-CLI menu actions.
type Special int

const (
	SpecialNone Special = iota
	SpecialCommand
	SpecialRestart // pick running service (or all), then child eip restart … -y
	SpecialLogs    // type → source pickers, then dump or follow window
)

// Entry is one selectable ops row.
type Entry struct {
	Title   string
	Desc    string
	Args    []string
	Special Special
}

type row struct {
	entry Entry
}

func (r row) Title() string       { return r.entry.Title }
func (r row) Description() string { return r.entry.Desc }
func (r row) FilterValue() string { return r.entry.Title }

// tuiHiddenVerbs are not home menu rows (background probe / CLI-only).
var tuiHiddenVerbs = map[string]bool{
	"doctor":       true, // public CLI name
	"probe":        true, // TUI/internal alias of doctor
	"ensure-mongo":          true, // CLI-only mongo Ensure (iterate without full up)
	"restore-mongo-keyfile": true, // CLI-only host keyfile recovery from live task
	"rekey-mongo":           true, // CLI-only rekey when stack is down + root creds
}

// Entries builds the home-screen catalog (unfiltered except TUI-hidden verbs).
func Entries() []Entry {
	verbs := catalog.Verbs()
	out := make([]Entry, 0, len(verbs)+2)
	for _, v := range verbs {
		if tuiHiddenVerbs[v.ID] {
			continue
		}
		switch v.ID {
		case "restart":
			out = append(out, Entry{Title: v.Title, Desc: v.Short, Special: SpecialRestart})
			continue
		case "logs":
			out = append(out, Entry{Title: v.Title, Desc: v.Short, Special: SpecialLogs})
			continue
		}
		out = append(out, Entry{
			Title: v.Title,
			Desc:  v.Short,
			Args:  v.Args(),
		})
	}
	out = append(out,
		Entry{Title: "Command...", Desc: "Type raw eip CLI args (power-user)", Special: SpecialCommand},
	)
	return out
}

// Allowed reports whether an entry may run for the current Docker light.
// Red/off: Command… only (tool version lives in the header). Amber: init/up/dev/status
// + Command…. Green: all (except TUI-hidden verbs, already omitted from Entries).
func Allowed(e Entry, docker status.Light) bool {
	id := ""
	if len(e.Args) > 0 {
		id = e.Args[0]
	}
	if tuiHiddenVerbs[id] {
		return false
	}
	switch docker {
	case status.LightGreen:
		return true
	case status.LightAmber:
		if e.Special == SpecialCommand {
			return true
		}
		if e.Special == SpecialRestart || e.Special == SpecialLogs {
			return false // needs a running stack
		}
		switch id {
		case "up", "dev", "init", "status":
			return true
		default:
			return false
		}
	default: // red or off
		return e.Special == SpecialCommand
	}
}

// VisibleEntries returns only entries allowed for the current Docker light.
func VisibleEntries(docker status.Light) []Entry {
	all := Entries()
	out := make([]Entry, 0, len(all))
	for _, e := range all {
		if Allowed(e, docker) {
			out = append(out, e)
		}
	}
	return out
}

// NewMenuList builds the home list gated for LightOff until the first probe.
func NewMenuList() (list.Model, *ui.MarqueeDelegate) {
	d := ui.NewMarqueeDelegate(28)
	return ui.NewList(listItems(VisibleEntries(status.LightOff)), d, 28, 10), d
}

// ApplyDockerGate rebuilds the list for the current Docker chip light.
func ApplyDockerGate(l *list.Model, docker status.Light) {
	if l == nil {
		return
	}
	// Keep selection by title when that row remains visible.
	keep := ""
	if cur, ok := Selected(*l); ok {
		keep = cur.Title
	}
	prevN := len(l.Items())
	items := listItems(VisibleEntries(docker))
	l.SetItems(items)
	if len(items) == 0 {
		return
	}
	// Opening path: LightOff shows only Command…; after probe expands the list,
	// jump to the first verb instead of staying on Command… at the bottom.
	if prevN < len(items) && keep == "Command..." {
		l.Select(0)
		return
	}
	for i, it := range items {
		if r, ok := it.(row); ok && r.entry.Title == keep {
			l.Select(i)
			return
		}
	}
	l.Select(0)
}

// Selected returns the highlighted entry, if any.
func Selected(l list.Model) (Entry, bool) {
	r, ok := l.SelectedItem().(row)
	if !ok {
		return Entry{}, false
	}
	return r.entry, true
}

func listItems(entries []Entry) []list.Item {
	items := make([]list.Item, len(entries))
	for i, e := range entries {
		items[i] = row{entry: e}
	}
	return items
}
