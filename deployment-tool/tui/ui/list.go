package ui

import (
	"charm.land/bubbles/v2/key"
	"charm.land/bubbles/v2/list"

	"eve-industry-planner/deployment-tool/tui/theme"
)

// NewList builds a home/nav list with marquee selection styling (keys + mouse zones).
func NewList(items []list.Item, d *MarqueeDelegate, width, height int) list.Model {
	if d == nil {
		d = NewMarqueeDelegate(width)
	}
	w := theme.Max(10, width)
	h := theme.Max(5, height)
	d.SetWidth(w)
	l := list.New(items, d, w, h)
	l.SetShowTitle(false)
	l.SetShowStatusBar(false)
	// Keep pagination for short panes (small terminals). ↑/↓ still cross pages.
	// Drop pgup/pgdn/f/d/… from page keys — home uses those for OUTPUT scroll.
	l.SetShowPagination(true)
	l.KeyMap.NextPage = key.NewBinding(
		key.WithKeys("right", "l"),
		key.WithHelp("→/l", "next page"),
	)
	l.KeyMap.PrevPage = key.NewBinding(
		key.WithKeys("left", "h"),
		key.WithHelp("←/h", "prev page"),
	)
	l.SetShowHelp(false)
	l.SetFilteringEnabled(false)
	l.KeyMap.Quit.SetEnabled(false)
	l.KeyMap.ForceQuit.SetEnabled(false)
	return l
}

// NewItemList builds a list from []Item.
func NewItemList(items []Item, width, height int) (list.Model, *MarqueeDelegate) {
	d := NewMarqueeDelegate(width)
	return NewList(ItemsToList(items), d, width, height), d
}

// SizeList sets list dimensions and keeps the same marquee delegate.
func SizeList(l *list.Model, d *MarqueeDelegate, width, height int) {
	if l == nil || d == nil {
		return
	}
	w := theme.Max(10, width)
	h := theme.Max(5, height)
	d.SetWidth(w)
	l.SetSize(w, h)
	l.SetDelegate(d)
}
