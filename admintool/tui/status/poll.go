package status

import (
	"time"

	tea "github.com/charmbracelet/bubbletea"
)

// PollInterval is how often home runs ProbeCmd (Docker chip refresh).
const PollInterval = 3 * time.Second

// PollTickMsg fires on the background probe cadence.
type PollTickMsg struct{}

// PollTick schedules the next ProbeCmd tick.
func PollTick() tea.Cmd {
	return tea.Tick(PollInterval, func(time.Time) tea.Msg {
		return PollTickMsg{}
	})
}
