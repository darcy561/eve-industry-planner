// Package ops is the home TUI menu SoT: plain-language titles, helpers, and
// Docker/Health gating. Entry.Args keep real CLI verb ids from internal/catalog;
// menus are not built mechanically from catalog.Verbs().
package ops

import (
	"errors"
	"io/fs"
	"os"
	"path/filepath"

	"charm.land/bubbles/v2/list"

	"eve-industry-planner/admintool/internal/kit"
	"eve-industry-planner/admintool/tui/status"
	"eve-industry-planner/admintool/tui/ui"
)

// Special marks non-CLI menu actions.
type Special int

const (
	SpecialNone Special = iota
	SpecialCommand // More → Command: host eip verbs + core tasks (cli …)
	SpecialRestart // pick running service (or all), then child eip restart … -y

	SpecialLogs    // type → source pickers, then dump or follow window
	SpecialSetup   // Setup: env builder → defaults/advanced config
	SpecialEditEnv // day-2 .env (+ backup path) builder — More → Secrets
	SpecialEditConfig
	SpecialMore // nested More list
	SpecialBack // return to parent menu (mouse-friendly; Esc still works)
)

// BackTitle is the shared ← Back row label (More, pickers, setup choice).
const BackTitle = "← Back"

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

// SetupNeeded reports whether first-run Setup should appear (operator docs or stacks missing).
func SetupNeeded(home string) bool {
	if home == "" {
		var err error
		home, err = kit.Home()
		if err != nil {
			return true
		}
	}
	_, errEnv := os.Stat(filepath.Join(home, kit.EnvFile))
	_, errCfg := os.Stat(filepath.Join(home, kit.ConfigFile))
	return errors.Is(errEnv, fs.ErrNotExist) || errors.Is(errCfg, fs.ErrNotExist) || kit.StacksMissing(home)
}

// Entries builds the main COMMANDS list (unfiltered except gating elsewhere).
// When Docker is green, Start vs Repair is filtered by Health (Update stays).
func Entries() []Entry {
	out := make([]Entry, 0, 13)
	if SetupNeeded("") {
		out = append(out, Entry{
			Title:   "Setup",
			Desc:    "Get started",
			Special: SpecialSetup,
		})
	}
	out = append(out,
		Entry{Title: "Status", Desc: "What's running", Args: []string{"status"}},
		Entry{Title: "Start", Desc: "Run the stack", Args: []string{"up"}},
		Entry{Title: "Repair", Desc: "Heal unhealthy services", Args: []string{"repair"}},
		Entry{Title: "Dev", Desc: "Run with local builds", Args: []string{"dev"}},
		Entry{Title: "Restart", Desc: "Reload services", Special: SpecialRestart},
		Entry{Title: "Rebuild", Desc: "Rebuild and apply local images", Args: []string{"rebuild"}},
		Entry{Title: "Stop", Desc: "Stop the stack (keeps data)", Args: []string{"shutdown"}},
		Entry{Title: "Update", Desc: "Update binary, stacks, and images", Args: []string{"update"}},
		Entry{Title: "More", Desc: "Settings, logs, and tools", Special: SpecialMore},
	)
	return out
}

// MoreEntries is the nested More submenu (no Apply secrets/settings — Persist auto-applies).
// Command is a normal row (same highlight / click / enter path as Secrets).
func MoreEntries() []Entry {
	return []Entry{
		{Title: BackTitle, Desc: "Return to main commands", Special: SpecialBack},
		{Title: "Command", Desc: "Run host eip verbs or core tasks", Special: SpecialCommand},
		{Title: "Secrets", Desc: "Edit passwords and keys", Special: SpecialEditEnv},
		{Title: "Settings", Desc: "Edit ports, scale, and paths", Special: SpecialEditConfig},
		{Title: "Logs", Desc: "View service output", Special: SpecialLogs},
	}
}

// Allowed reports whether an entry may run for the current Docker + Health lights.
// When Docker is green: Start if Health off; Repair if amber/red; Update always
// (Start/Repair hidden when Health green).
func Allowed(e Entry, docker, health status.Light) bool {
	id := ""
	if len(e.Args) > 0 {
		id = e.Args[0]
	}
	switch e.Special {
	case SpecialSetup, SpecialEditEnv, SpecialEditConfig, SpecialMore, SpecialBack, SpecialCommand:
		return true
	case SpecialLogs:
		return docker == status.LightGreen
	case SpecialRestart:
		return docker == status.LightGreen
	}
	switch docker {
	case status.LightGreen:
		switch id {
		case "up":
			return health == status.LightOff
		case "repair":
			return health == status.LightAmber || health == status.LightRed
		default:
			return true
		}
	case status.LightAmber:
		switch id {
		case "up", "dev", "status":
			return true
		default:
			return false
		}
	default: // red or off
		return false
	}
}

// VisibleEntries returns main-menu entries allowed for Docker + Health lights.
func VisibleEntries(docker, health status.Light) []Entry {
	return filterAllowed(Entries(), docker, health)
}

// VisibleMoreEntries returns More submenu rows allowed for the current Docker light.
func VisibleMoreEntries(docker status.Light) []Entry {
	return filterAllowed(MoreEntries(), docker, status.LightOff)
}

func filterAllowed(all []Entry, docker, health status.Light) []Entry {
	out := make([]Entry, 0, len(all))
	for _, e := range all {
		if Allowed(e, docker, health) {
			out = append(out, e)
		}
	}
	return out
}

// NewMenuList builds the home list gated for LightOff until the first probe.
func NewMenuList() (list.Model, *ui.MarqueeDelegate) {
	d := ui.NewMarqueeDelegate(28)
	return ui.NewList(listItems(VisibleEntries(status.LightOff, status.LightOff)), d, 28, 10), d
}

// ApplyMenuGate rebuilds the main list for the current Docker + Health lights.
func ApplyMenuGate(l *list.Model, docker, health status.Light) {
	applyGate(l, VisibleEntries(docker, health), true)
}

// ApplyMoreGate rebuilds the More submenu for the current Docker light.
func ApplyMoreGate(l *list.Model, docker status.Light) {
	applyGate(l, VisibleMoreEntries(docker), false)
}

// applyGate replaces list items, keeping selection by title when possible.
// jumpToTopOnExpand: when the Main list grows and the keep title is Setup/More,
// select the first row instead (post-probe path). More gate passes false.
func applyGate(l *list.Model, entries []Entry, jumpToTopOnExpand bool) {
	if l == nil {
		return
	}
	keep := ""
	if cur, ok := Selected(*l); ok {
		keep = cur.Title
	}
	prevN := len(l.Items())
	items := listItems(entries)
	l.SetItems(items)
	if len(items) == 0 {
		return
	}
	if jumpToTopOnExpand && prevN < len(items) && (keep == "More" || keep == "Setup") {
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
