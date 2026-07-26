// Package brand is product mark / header artwork for the TUI.
package brand

import "github.com/charmbracelet/lipgloss"

// EIP block letters from Eve Industry Planner Tools (cli/cli.go).
var logoLines = []string{
	"███████╗██╗██████╗ ",
	"██╔════╝██║██╔══██╗",
	"█████╗  ██║██████╔╝",
	"██╔══╝  ██║██╔═══╝ ",
	"███████╗██║██║     ",
	"╚══════╝╚═╝╚═╝     ",
}

// Logo renders the EIP mark in accent color.
func Logo(accent lipgloss.Color) string {
	style := lipgloss.NewStyle().Foreground(accent).Bold(true)
	out := make([]string, len(logoLines))
	for i, line := range logoLines {
		out[i] = style.Render(line)
	}
	return lipgloss.JoinVertical(lipgloss.Left, out...)
}

// Height is the logo row count (for chrome layout).
func Height() int {
	return len(logoLines)
}

// Compact half-block EIP for thin title bars (log follow). Not a crop of Logo —
// the full mark needs all six rows; slicing it in half is unreadable.
// E uses █▀█/█▄▄ (middle bar) so it does not read as C.
var miniLogoLines = []string{
	"█▀█ █ █▀█",
	"█▄▄ █ █▀▀",
}

// MiniLogo renders the compact EIP mark in accent color.
func MiniLogo(accent lipgloss.Color) string {
	style := lipgloss.NewStyle().Foreground(accent).Bold(true)
	out := make([]string, len(miniLogoLines))
	for i, line := range miniLogoLines {
		out[i] = style.Render(line)
	}
	return lipgloss.JoinVertical(lipgloss.Left, out...)
}

// MiniHeight is the mini logo row count.
func MiniHeight() int {
	return len(miniLogoLines)
}
