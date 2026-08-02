package theme

import "charm.land/lipgloss/v2"

func NormalTitle() lipgloss.Style {
	return lipgloss.NewStyle().Foreground(Text).Bold(true)
}

func NormalDesc() lipgloss.Style {
	return lipgloss.NewStyle().Foreground(Muted)
}

func SelectedTitle(width int) lipgloss.Style {
	return lipgloss.NewStyle().
		Width(width).
		Foreground(OnPrimary).
		Background(Primary).
		Bold(true).
		Padding(0, 1)
}

func SelectedDesc(width int) lipgloss.Style {
	return lipgloss.NewStyle().
		Width(width).
		Foreground(OnPrimaryMuted).
		Background(Primary).
		Padding(0, 1)
}

func PanelTitle(text string) string {
	return lipgloss.NewStyle().Bold(true).Foreground(Primary).Render(text)
}

func MutedText(text string) string {
	return lipgloss.NewStyle().Foreground(Muted).Render(text)
}

func HelpLine(width int, text string) string {
	return lipgloss.NewStyle().
		Foreground(Muted).
		Width(width).
		Padding(0, HMargin).
		Render(text)
}
