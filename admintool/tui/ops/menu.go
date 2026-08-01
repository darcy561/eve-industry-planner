// Package ops builds the home command list from internal/catalog (SoT).
// Menu visibility is gated by status.Snapshot.Docker (chip light), not by
// listening to EIPMSG chip events directly. TUI titles/helpers are plain-language;
// Args keep real CLI verb ids.
package ops

import (
	"os"
	"path/filepath"

	"github.com/charmbracelet/bubbles/list"

	"eve-industry-planner/admintool/internal/kit"
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
	SpecialSetup   // Setup: env builder → defaults/advanced config
	SpecialEditEnv // day-2 .env (+ backup path) builder — More → Secrets
	SpecialEditConfig
	SpecialMore // nested More list
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
	return os.IsNotExist(errEnv) || os.IsNotExist(errCfg) || kit.StacksMissing(home)
}

// Entries builds the main COMMANDS list (unfiltered except gating elsewhere).
func Entries() []Entry {
	out := make([]Entry, 0, 12)
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
func MoreEntries() []Entry {
	return []Entry{
		{Title: "Secrets", Desc: "Edit passwords and keys", Special: SpecialEditEnv},
		{Title: "Settings", Desc: "Edit ports, scale, and paths", Special: SpecialEditConfig},
		{Title: "Logs", Desc: "View service output", Special: SpecialLogs},
		{Title: "Command", Desc: "Type a custom command", Special: SpecialCommand},
	}
}

// Allowed reports whether an entry may run for the current Docker light.
func Allowed(e Entry, docker status.Light) bool {
	id := ""
	if len(e.Args) > 0 {
		id = e.Args[0]
	}
	switch e.Special {
	case SpecialSetup, SpecialEditEnv, SpecialEditConfig, SpecialCommand, SpecialMore:
		return true
	case SpecialLogs:
		return docker == status.LightGreen
	case SpecialRestart:
		return docker == status.LightGreen
	}
	switch docker {
	case status.LightGreen:
		return true
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

// VisibleEntries returns main-menu entries allowed for the current Docker light.
func VisibleEntries(docker status.Light) []Entry {
	return filterAllowed(Entries(), docker)
}

// VisibleMoreEntries returns More submenu rows allowed for the current Docker light.
func VisibleMoreEntries(docker status.Light) []Entry {
	return filterAllowed(MoreEntries(), docker)
}

func filterAllowed(all []Entry, docker status.Light) []Entry {
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

// ApplyDockerGate rebuilds the main list for the current Docker chip light.
func ApplyDockerGate(l *list.Model, docker status.Light) {
	applyGate(l, VisibleEntries(docker), true)
}

// ApplyMoreGate rebuilds the More submenu for the current Docker light.
func ApplyMoreGate(l *list.Model, docker status.Light) {
	applyGate(l, VisibleMoreEntries(docker), false)
}

// applyGate replaces list items, keeping selection by title when possible.
// jumpToTopOnExpand: when the list grows and the keep title is a file-only row
// (Setup/More/Command), select the first row instead (post-probe path).
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
	if jumpToTopOnExpand && prevN < len(items) &&
		(keep == "More" || keep == "Setup" || keep == "Command") {
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
