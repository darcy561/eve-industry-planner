package ui

import (
	"fmt"
	"io"

	"charm.land/bubbles/v2/list"
	tea "charm.land/bubbletea/v2"

	"eve-industry-planner/deployment-tool/tui/theme"
)

// MarqueeDelegate renders fixed-width rows: ellipsis when idle, slow marquee
// on the selected description so long helpers never reflow the layout.
type MarqueeDelegate struct {
	Width     int
	Offset    int
	lastIndex int
	height    int
	spacing   int
}

// NewMarqueeDelegate builds a 2-line title+desc delegate.
func NewMarqueeDelegate(width int) *MarqueeDelegate {
	return &MarqueeDelegate{
		Width:     theme.Max(8, width),
		lastIndex: -1,
		height:    2,
		spacing:   0,
	}
}

func (d *MarqueeDelegate) Height() int  { return d.height }
func (d *MarqueeDelegate) Spacing() int { return d.spacing }

// Update advances the marquee on MarqueeTickMsg (bubbles ItemDelegate hook).
func (d *MarqueeDelegate) Update(msg tea.Msg, m *list.Model) tea.Cmd {
	if _, ok := msg.(MarqueeTickMsg); !ok || m == nil {
		return nil
	}
	d.Advance(m.Index())
	return MarqueeTick()
}

// Advance steps the marquee; resets when the selection changes.
func (d *MarqueeDelegate) Advance(selectedIndex int) {
	if selectedIndex != d.lastIndex {
		d.lastIndex = selectedIndex
		d.Offset = 0
		return
	}
	d.Offset++
}

// SetWidth updates the row width used for truncate/marquee.
func (d *MarqueeDelegate) SetWidth(width int) {
	d.Width = theme.Max(8, width)
}

func (d *MarqueeDelegate) Render(w io.Writer, m list.Model, index int, item list.Item) {
	row, ok := item.(list.DefaultItem)
	if !ok || d.Width <= 0 {
		return
	}

	inner := theme.Max(1, d.Width-2) // match Padding(0, 1) on styles
	title := FitEllipsis(row.Title(), inner)
	desc := row.Description()
	selected := index == m.Index()

	if selected {
		desc = MarqueeWindow(desc, inner, d.Offset)
	} else {
		desc = FitEllipsis(desc, inner)
	}

	var titleStyled, descStyled string
	if selected {
		titleStyled = theme.SelectedTitle(d.Width).Render(title)
		descStyled = theme.SelectedDesc(d.Width).Render(desc)
	} else {
		titleStyled = theme.NormalTitle().
			MaxWidth(d.Width).
			Padding(0, 1).
			Render(title)
		descStyled = theme.NormalDesc().
			MaxWidth(d.Width).
			Padding(0, 1).
			Render(desc)
	}

	rowView := titleStyled + "\n" + descStyled
	// Mark after width/marquee math so zone markers do not skew StringWidth.
	fmt.Fprint(w, Mark(ZoneListRow(index), rowView))
}
