package status

import (
	"time"

	tea "github.com/charmbracelet/bubbletea"
)

// StatusMsgHold is how long the unlabeled bar text stays after a command ends
// before it is cleared. Cleared immediately on the next command start.
const StatusMsgHold = 5 * time.Second

// ClearStatusMsgMsg clears StatusMsg when gen still matches (stale timers ignored).
type ClearStatusMsgMsg struct {
	Gen int
}

// ClearStatusMsgAfter schedules a StatusMsg clear after StatusMsgHold.
func ClearStatusMsgAfter(gen int) tea.Cmd {
	return tea.Tick(StatusMsgHold, func(time.Time) tea.Msg {
		return ClearStatusMsgMsg{Gen: gen}
	})
}
