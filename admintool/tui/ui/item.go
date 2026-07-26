package ui

import "github.com/charmbracelet/bubbles/list"

// Item is a reusable title+help row for menus, wizards, and settings lists.
type Item struct {
	title string
	desc  string
}

// NewItem builds a list row.
func NewItem(title, desc string) Item {
	return Item{title: title, desc: desc}
}

func (i Item) Title() string       { return i.title }
func (i Item) Description() string { return i.desc }
func (i Item) FilterValue() string { return i.title }

// ItemsToList adapts []Item for bubbles/list.
func ItemsToList(items []Item) []list.Item {
	out := make([]list.Item, len(items))
	for i := range items {
		out[i] = items[i]
	}
	return out
}

// SelectedItem returns the highlighted Item, if any.
func SelectedItem(l list.Model) (Item, bool) {
	item, ok := l.SelectedItem().(Item)
	return item, ok
}
