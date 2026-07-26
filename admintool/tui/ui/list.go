package ui

import (
	"github.com/charmbracelet/bubbles/list"

	"eve-industry-planner/admintool/tui/theme"
)

// NewList builds a keyboard-only list with marquee selection styling.
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
	l.SetShowPagination(true)
	l.SetShowHelp(false)
	l.SetFilteringEnabled(false)
	l.KeyMap.Quit.SetEnabled(false)
	l.KeyMap.ForceQuit.SetEnabled(false)
	// Home owns PgUp/PgDn for the output pane — do not page the menu list.
	l.KeyMap.NextPage.SetEnabled(false)
	l.KeyMap.PrevPage.SetEnabled(false)
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
