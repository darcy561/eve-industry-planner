package ui

import tea "charm.land/bubbletea/v2"

// PlaceCursor offsets a widget-local cursor into terminal coordinates.
func PlaceCursor(base *tea.Cursor, originX, originY int) *tea.Cursor {
	if base == nil {
		return nil
	}
	out := *base
	out.X = originX + base.X
	out.Y = originY + base.Y
	return &out
}
