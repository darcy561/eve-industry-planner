package builder

import (
	"strings"

	"charm.land/huh/v2"
	"charm.land/lipgloss/v2"

	"eve-industry-planner/deployment-tool/tui/theme"
	"eve-industry-planner/deployment-tool/tui/ui"
)

type fieldBand struct {
	idx   int
	start int // inclusive line in form content
	end   int // exclusive
}

func (s *Session) formContentWidth() int {
	innerW, _ := ui.PanelInnerSize(s.rightW, s.bodyH)
	return theme.Max(20, innerW-2)
}

func (s *Session) renderHuhField(f huh.Field, width int) string {
	if f == nil {
		return ""
	}
	f.WithTheme(eipHuhTheme())
	f.WithWidth(width)
	return f.View()
}

// fieldBands returns content-line ranges for each logical section field, matching
// rebuildForm's huh field order (preface notes, then per-field widgets + separators).
func (s *Session) fieldBands() []fieldBand {
	sec := s.currentSection()
	width := s.formContentWidth()
	y := 0
	needSep := false
	add := func(f huh.Field) {
		if needSep {
			y++ // huh FieldSeparator "\n\n" → one blank line between widgets
		}
		needSep = true
		h := lipgloss.Height(s.renderHuhField(f, width))
		if h < 1 {
			h = 1
		}
		y += h
	}

	if s.finishErr != "" {
		add(huh.NewNote().Title("Finish error").Description(s.finishErr))
	}
	if sec.Help != "" {
		add(huh.NewNote().Title(sec.Title).Description(sec.Help))
	}

	bands := make([]fieldBand, 0, len(sec.Fields))
	for i, f := range sec.Fields {
		start := y
		if needSep {
			start = y + 1 // band starts at first widget line, after separator
		}
		for _, w := range s.huhFieldsFor(i, f) {
			add(w)
		}
		bands = append(bands, fieldBand{idx: i, start: start, end: y})
	}
	return bands
}

// markFormFieldZones wraps each logical field's lines so bubblezone can hit-test
// Autogen / Yes-No / inputs on the control itself (not a row above).
func (s *Session) markFormFieldZones(content string) string {
	if content == "" {
		return content
	}
	bands := s.fieldBands()
	if len(bands) == 0 {
		return content
	}
	lines := strings.Split(content, "\n")
	lastEnd := bands[len(bands)-1].end
	if lastEnd > len(lines) {
		// Focus chrome / wrap mismatch — leave unmarked; mouse falls back to bands.
		return content
	}

	var out strings.Builder
	cursor := 0
	writeLines := func(from, to int) {
		for i := from; i < to && i < len(lines); i++ {
			if out.Len() > 0 {
				out.WriteByte('\n')
			}
			out.WriteString(lines[i])
		}
	}
	for _, b := range bands {
		if b.start < cursor {
			continue
		}
		writeLines(cursor, b.start)
		// One Mark per field (bounding box). Same id on every line would
		// overwrite in bubblezone and only the last line would stay clickable.
		var block strings.Builder
		for i := b.start; i < b.end && i < len(lines); i++ {
			if block.Len() > 0 {
				block.WriteByte('\n')
			}
			block.WriteString(lines[i])
		}
		if out.Len() > 0 {
			out.WriteByte('\n')
		}
		out.WriteString(ui.Mark(ui.ZoneFormField(b.idx), block.String()))
		cursor = b.end
	}
	writeLines(cursor, len(lines))
	return out.String()
}
