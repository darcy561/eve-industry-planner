package builder

import (
	"charm.land/bubbles/v2/viewport"

	"eve-industry-planner/deployment-tool/tui/ui"
)

// sizeFormVP sizes the form scroll viewport inside the right panel
// (panel title + section footer + Back/Finish reserved below the scroll area).
func (s *Session) sizeFormVP() {
	innerW, innerH := ui.PanelInnerSize(s.rightW, s.bodyH)
	h := max(3, innerH-7)
	w := max(12, innerW-2)
	if s.formVP.Width() == 0 {
		s.formVP = viewport.New(viewport.WithWidth(w), viewport.WithHeight(h))
		s.formVP.MouseWheelEnabled = false
	} else {
		s.formVP.SetWidth(w)
		s.formVP.SetHeight(h)
	}
}

func (s *Session) syncFormVPContent() {
	s.sizeFormVP()
	content := ""
	if s.form != nil {
		content = s.markFormFieldZones(s.form.View())
	}
	y := s.formVP.YOffset()
	s.formVP.SetContent(content)
	s.formVP.SetYOffset(y)
}

// scrollFormLines scrolls the form viewport. Positive n scrolls down.
func (s *Session) scrollFormLines(n int) {
	s.syncFormVPContent()
	if n < 0 {
		s.formVP.ScrollUp(-n)
		return
	}
	if n > 0 {
		s.formVP.ScrollDown(n)
	}
}

func (s *Session) scrollFormPage(up bool) {
	s.syncFormVPContent()
	if up {
		s.formVP.HalfPageUp()
		return
	}
	s.formVP.HalfPageDown()
}
