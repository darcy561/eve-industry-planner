package ui

import (
	"charm.land/bubbles/v2/viewport"
	"charm.land/lipgloss/v2"

	"eve-industry-planner/deployment-tool/tui/theme"
)

// SplitLayout is the left/right body split (ops: commands|output; settings: nav|form).
type SplitLayout struct {
	LeftW  int // outer width including border
	RightW int // outer width including border
	BodyH  int // outer height including border
}

// CalcSplit sizes the two-pane body given terminal size and reserved chrome height.
func CalcSplit(termW, termH, chromeH int) SplitLayout {
	bodyH := max(termH-chromeH, 8)

	usableW := termW - 2*theme.HMargin
	if usableW < 40 {
		usableW = max(40, termW)
	}
	leftW := min(max(usableW*36/100, 30), 44)
	rightW := usableW - leftW - theme.ColGap
	if rightW < 28 {
		rightW = 28
		leftW = max(22, usableW-rightW-theme.ColGap)
	}
	return SplitLayout{LeftW: leftW, RightW: rightW, BodyH: bodyH}
}

// PanelInnerSize is content width/height inside a bordered panel.
func PanelInnerSize(outerW, outerH int) (innerW, innerH int) {
	return max(12, outerW-2), max(5, outerH-2)
}

// ListSizeInPanel returns list dimensions inside a titled panel.
func ListSizeInPanel(outerW, outerH int) (listW, listH int) {
	innerW, innerH := PanelInnerSize(outerW, outerH)
	return max(10, innerW-2), max(5, innerH-2)
}

// ViewportSizeInPanel returns viewport dimensions inside a titled panel.
func ViewportSizeInPanel(outerW, outerH int) (vpW, vpH int) {
	innerW, innerH := PanelInnerSize(outerW, outerH)
	return max(12, innerW-2), max(5, innerH-2)
}

// RenderPanel draws a rounded bordered pane with a primary-colored title.
func RenderPanel(title, body string, outerW, outerH int) string {
	innerW, innerH := PanelInnerSize(outerW, outerH)
	inner := theme.PanelTitle(title) + "\n" + body
	return lipgloss.NewStyle().
		Width(innerW).
		Height(innerH).
		Border(lipgloss.RoundedBorder()).
		BorderForeground(theme.Border).
		Padding(0, 1).
		Render(inner)
}

// JoinPanes places left and right panels with outer gutters and a column gap.
func JoinPanes(left, right string) string {
	return lipgloss.NewStyle().
		PaddingLeft(theme.HMargin).
		PaddingRight(theme.HMargin).
		Render(lipgloss.JoinHorizontal(lipgloss.Top,
			left,
			lipgloss.NewStyle().Width(theme.ColGap).Render(""),
			right,
		))
}

// HelpLine renders the footer key-hint strip.
func HelpLine(termW int, text string) string {
	return theme.HelpLine(termW, text)
}

// NewOutputViewport builds an OUTPUT/form viewport (soft-wrap on).
// Home/builder scroll via zone wheel routing; set MouseWheelEnabled for
// standalone viewports that handle tea.MouseMsg themselves (logview).
func NewOutputViewport(content string) viewport.Model {
	vp := viewport.New()
	vp.SoftWrap = true
	vp.SetContent(content)
	vp.MouseWheelEnabled = false
	return vp
}

// SizeViewport sets viewport dimensions.
func SizeViewport(vp *viewport.Model, width, height int) {
	if vp == nil {
		return
	}
	vp.SetWidth(max(12, width))
	vp.SetHeight(max(5, height))
}

// SetViewportText replaces content. When followBottom is true, keeps the view
// pinned to the latest lines; otherwise preserves the current scroll offset
// (clamped) so the operator can read history while output still appends.
// Soft wrapping is handled by the viewport (SoftWrap).
func SetViewportText(vp *viewport.Model, text string, followBottom bool) {
	if vp == nil {
		return
	}
	y := vp.YOffset()
	vp.SetContent(text)
	if followBottom {
		vp.GotoBottom()
		return
	}
	vp.SetYOffset(y)
}
