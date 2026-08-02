package builder

import (
	"time"

	tea "charm.land/bubbletea/v2"
	"charm.land/huh/v2"
)

// settleForm runs huh Init msgs against s.form immediately so View works while
// the section list has focus. Cursor blink cmds block if invoked outside a
// Program — those are timed out and dropped (tea will start blinks on focus later).
func (s *Session) settleForm(cmd tea.Cmd) {
	if s.form == nil || cmd == nil {
		return
	}
	for i := 0; i < 64; i++ {
		msg, ok := tryCmdMsg(cmd, 25*time.Millisecond)
		if !ok {
			return
		}
		if msg == nil {
			return
		}
		switch msg := msg.(type) {
		case tea.BatchMsg:
			for _, c := range msg {
				s.settleForm(c)
			}
			return
		default:
			if cmds, ok := cmdsFromMsg(msg); ok {
				for _, c := range filterWindowSizeCmds(cmds) {
					s.settleForm(c)
				}
				return
			}
			if isWindowSizeMsg(msg) {
				return
			}
			model, next := s.form.Update(msg)
			if f, ok := model.(*huh.Form); ok {
				s.form = f
			}
			cmd = next
			if cmd == nil || s.form.State != huh.StateNormal {
				return
			}
		}
	}
}

func tryCmdMsg(cmd tea.Cmd, timeout time.Duration) (tea.Msg, bool) {
	if cmd == nil {
		return nil, true
	}
	ch := make(chan tea.Msg, 1)
	go func() {
		ch <- cmd()
	}()
	select {
	case msg := <-ch:
		return msg, true
	case <-time.After(timeout):
		// Likely cursor.Blink / tick — safe to drop during sync settle.
		return nil, false
	}
}
