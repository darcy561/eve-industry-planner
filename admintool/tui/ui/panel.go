package ui

import (
	"strings"

	"github.com/charmbracelet/bubbles/viewport"
	"github.com/charmbracelet/lipgloss"

	"eve-industry-planner/admintool/tui/theme"
)

// SplitLayout is the left/right body split (ops: commands|output; settings: nav|form).
type SplitLayout struct {
	LeftW  int // outer width including border
	RightW int // outer width including border
	BodyH  int // outer height including border
}

// CalcSplit sizes the two-pane body given terminal size and reserved chrome height.
func CalcSplit(termW, termH, chromeH int) SplitLayout {
	bodyH := termH - chromeH
	if bodyH < 8 {
		bodyH = 8
	}

	usableW := termW - 2*theme.HMargin
	if usableW < 40 {
		usableW = theme.Max(40, termW)
	}
	leftW := usableW * 36 / 100
	if leftW < 30 {
		leftW = 30
	}
	if leftW > 44 {
		leftW = 44
	}
	rightW := usableW - leftW - theme.ColGap
	if rightW < 28 {
		rightW = 28
		leftW = theme.Max(22, usableW-rightW-theme.ColGap)
	}
	return SplitLayout{LeftW: leftW, RightW: rightW, BodyH: bodyH}
}

// PanelInnerSize is content width/height inside a bordered panel.
func PanelInnerSize(outerW, outerH int) (innerW, innerH int) {
	return theme.Max(12, outerW-2), theme.Max(5, outerH-2)
}

// ListSizeInPanel returns list dimensions inside a titled panel.
func ListSizeInPanel(outerW, outerH int) (listW, listH int) {
	innerW, innerH := PanelInnerSize(outerW, outerH)
	return theme.Max(10, innerW-2), theme.Max(5, innerH-2)
}

// ViewportSizeInPanel returns viewport dimensions inside a titled panel.
func ViewportSizeInPanel(outerW, outerH int) (vpW, vpH int) {
	innerW, innerH := PanelInnerSize(outerW, outerH)
	return theme.Max(12, innerW-2), theme.Max(5, innerH-2)
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

// NewOutputViewport builds a keyboard-scrolled output pane (mouse wheel off).
func NewOutputViewport(content string) viewport.Model {
	vp := viewport.New(0, 0)
	vp.SetContent(content)
	vp.MouseWheelEnabled = false
	return vp
}

// SizeViewport sets viewport dimensions.
func SizeViewport(vp *viewport.Model, width, height int) {
	if vp == nil {
		return
	}
	vp.Width = theme.Max(12, width)
	vp.Height = theme.Max(5, height)
}

// SetViewportText replaces content. When followBottom is true, keeps the view
// pinned to the latest lines; otherwise preserves the current scroll offset
// (clamped) so the operator can read history while output still appends.
// Soft-wraps to the viewport width so long log lines stay readable.
func SetViewportText(vp *viewport.Model, text string, followBottom bool) {
	if vp == nil {
		return
	}
	y := vp.YOffset
	w := vp.Width
	if w < 8 {
		w = 8
	}
	vp.SetContent(SoftWrap(text, w))
	if followBottom {
		vp.GotoBottom()
		return
	}
	vp.SetYOffset(y)
}

// SoftWrap inserts newlines so no visual line exceeds width (rune-aware).
func SoftWrap(text string, width int) string {
	if width < 8 || text == "" {
		return text
	}
	lines := strings.Split(text, "\n")
	var b strings.Builder
	b.Grow(len(text) + len(lines))
	for i, line := range lines {
		if i > 0 {
			b.WriteByte('\n')
		}
		runes := []rune(line)
		for len(runes) > width {
			b.WriteString(string(runes[:width]))
			b.WriteByte('\n')
			runes = runes[width:]
		}
		b.WriteString(string(runes))
	}
	return b.String()
}
