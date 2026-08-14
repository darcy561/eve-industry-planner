package ui

import (
	"testing"

	"charm.land/bubbles/v2/list"
)

func TestSmallHeightPaginationReachesLastItem(t *testing.T) {
	// 2-line rows + pagination chrome → PerPage < item count on a short list.
	items := make([]Item, 0, 8)
	for _, title := range []string{"A", "B", "C", "D", "E", "F", "G", "H"} {
		items = append(items, NewItem(title, "desc"))
	}
	l, _ := NewItemList(items, 28, 6)
	if !l.ShowPagination() {
		t.Fatal("want pagination chrome for short panes")
	}
	if l.Paginator.TotalPages < 2 {
		t.Fatalf("want multiple pages at height=6, got TotalPages=%d PerPage=%d",
			l.Paginator.TotalPages, l.Paginator.PerPage)
	}

	for i := 0; i < len(items)+2; i++ {
		l.CursorDown()
	}
	if l.Index() != len(items)-1 {
		t.Fatalf("CursorDown across pages: index=%d want %d", l.Index(), len(items)-1)
	}
	sel, ok := l.SelectedItem().(list.DefaultItem)
	if !ok || sel.Title() != "H" {
		t.Fatalf("selected=%v ok=%v", sel, ok)
	}
}
