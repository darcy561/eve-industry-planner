package builder

import (
	"charm.land/huh/v2"
	"charm.land/lipgloss/v2"

	"eve-industry-planner/admintool/tui/theme"
)

// eipHuhTheme is force-dark huh styles aligned with tui/theme.
func eipHuhTheme() huh.Theme {
	return huh.ThemeFunc(func(_ bool) *huh.Styles {
		s := huh.ThemeBase16(true)
		p := theme.Primary
		s.Focused.Base = s.Focused.Base.BorderForeground(theme.Border)
		s.Focused.Title = s.Focused.Title.Foreground(p).Bold(true)
		s.Focused.NoteTitle = s.Focused.NoteTitle.Foreground(p).Bold(true)
		s.Focused.Description = s.Focused.Description.Foreground(theme.Muted)
		s.Focused.SelectSelector = s.Focused.SelectSelector.Foreground(p)
		s.Focused.MultiSelectSelector = s.Focused.MultiSelectSelector.Foreground(p)
		s.Focused.SelectedPrefix = lipgloss.NewStyle().SetString("[x] ").Foreground(p)
		s.Focused.UnselectedPrefix = lipgloss.NewStyle().SetString("[ ] ").Foreground(theme.Muted)
		s.Focused.NextIndicator = s.Focused.NextIndicator.Foreground(p)
		s.Focused.PrevIndicator = s.Focused.PrevIndicator.Foreground(p)
		s.Focused.FocusedButton = s.Focused.FocusedButton.
			Foreground(theme.OnPrimary).Background(p).Bold(true)
		s.Focused.BlurredButton = s.Focused.BlurredButton.
			Foreground(theme.Muted).Background(lipgloss.Color("236"))
		s.Focused.TextInput.Cursor = s.Focused.TextInput.Cursor.Foreground(p)
		s.Focused.TextInput.Prompt = s.Focused.TextInput.Prompt.Foreground(p)
		s.Focused.TextInput.Text = s.Focused.TextInput.Text.Foreground(theme.Text)
		s.Focused.TextInput.Placeholder = s.Focused.TextInput.Placeholder.Foreground(theme.Muted)

		s.Blurred = s.Focused
		s.Blurred.Base = s.Focused.Base.BorderStyle(lipgloss.HiddenBorder())
		s.Blurred.MultiSelectSelector = lipgloss.NewStyle().SetString("  ")
		s.Group.Title = s.Focused.Title
		s.Group.Description = s.Focused.Description
		return s
	})
}
