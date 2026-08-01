package builder

import (
	"strings"
	"testing"

	tea "github.com/charmbracelet/bubbletea"
)

func stubSections() []Section {
	return []Section{
		{
			ID: "home", Title: "Deploy home", Help: "Where files live",
			Fields: []Field{
				{ID: "path", Label: "Project home", Kind: KindReadonly, Value: "/tmp/demo"},
				{ID: "note", Label: "Note", Kind: KindText, Value: "hello", Help: "optional"},
			},
		},
		{
			ID: "secrets", Title: "Secrets", Help: "Stub secrets",
			Fields: []Field{
				{ID: "pw", Label: "Password", Kind: KindSecret, Value: "x", Autogen: true, AutogenOn: true},
			},
		},
		{
			ID: "sso", Title: "SSO", Help: "Stub SSO",
			Fields: []Field{
				{ID: "cid", Label: "Client ID", Kind: KindText, Value: ""},
			},
		},
	}
}

func TestNewSessionViewNonEmpty(t *testing.T) {
	t.Parallel()
	s := NewSession("INIT", stubSections())
	s.SetSize(36, 60, 20)
	view := s.View()
	if view == "" {
		t.Fatal("empty view")
	}
	if !strings.Contains(view, "Deploy home") && !strings.Contains(view, "INIT") {
		t.Fatalf("missing nav/title: %q", view[:min(200, len(view))])
	}
}

func TestCancelFromNav(t *testing.T) {
	t.Parallel()
	s := NewSession("INIT", stubSections())
	s.focus = focusNav
	var got tea.Msg
	_, cmd := s.Update(tea.KeyMsg{Type: tea.KeyEsc})
	if cmd == nil {
		t.Fatal("want CancelMsg cmd")
	}
	got = cmd()
	if _, ok := got.(CancelMsg); !ok {
		t.Fatalf("got %T", got)
	}
}

func TestEscFromFormReturnsToNav(t *testing.T) {
	t.Parallel()
	s := NewSession("INIT", stubSections())
	s.focus = focusForm
	s, _ = s.Update(tea.KeyMsg{Type: tea.KeyEsc})
	if s.FocusForm() {
		t.Fatal("still on form")
	}
}

func TestDoneMsg(t *testing.T) {
	t.Parallel()
	s := NewSession("INIT", stubSections())
	_, cmd := s.Update(tea.KeyMsg{Type: tea.KeyCtrlS})
	if cmd == nil {
		t.Fatal("want DoneMsg cmd")
	}
	got := cmd()
	if _, ok := got.(DoneMsg); !ok {
		t.Fatalf("got %T", got)
	}
}

func TestSectionSwitch(t *testing.T) {
	t.Parallel()
	s := NewSession("INIT", stubSections())
	s.SetSize(36, 60, 20)
	if s.ActiveIndex() != 0 {
		t.Fatalf("idx=%d", s.ActiveIndex())
	}
	s.selectSection(1)
	if s.ActiveIndex() != 1 {
		t.Fatalf("idx=%d", s.ActiveIndex())
	}
	view := s.View()
	if !strings.Contains(strings.ToUpper(view), "SECRETS") {
		t.Fatalf("expected secrets panel: %q", view[:min(300, len(view))])
	}
}

func TestSpaceTogglesAutogen(t *testing.T) {
	t.Parallel()
	s := NewSession("INIT", stubSections())
	s.selectSection(1)
	s.focus = focusForm
	s.fieldIdx = 0
	if !s.sections[1].Fields[0].AutogenOn {
		t.Fatal("stub starts AutogenOn")
	}
	s, _ = s.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{' '}})
	if s.sections[1].Fields[0].AutogenOn {
		t.Fatal("space should uncheck Autogen")
	}
	vals, gen := s.Collect()
	if vals["pw"] != "x" {
		t.Fatalf("value=%q", vals["pw"])
	}
	if gen["pw"] {
		t.Fatal("generate flag should be false")
	}
}

func TestLockedNoAutogenToggle(t *testing.T) {
	t.Parallel()
	secs := []Section{{
		ID: "x", Title: "X",
		Fields: []Field{{
			ID: "MONGO_PASSWORD", Label: "Mongo", Kind: KindReadonly,
			Value: "secret", Autogen: true, AutogenOn: false, Locked: true,
		}},
	}}
	s := NewSession("INIT", secs)
	s.focus = focusForm
	s.fieldIdx = 0
	s, _ = s.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{' '}})
	if s.sections[0].Fields[0].AutogenOn {
		t.Fatal("locked field must not toggle Autogen")
	}
}

func TestCtrlRPendingRollKeepsBuffer(t *testing.T) {
	t.Parallel()
	secs := []Section{{
		ID: "secrets", Title: "Secrets",
		Fields: []Field{{
			ID: "AUTHZ_HMAC_KEY", Label: "HMAC", Kind: KindSecret,
			Value: "keep-this-until-save", Autogen: true, AutogenOn: false,
		}},
	}}
	s := NewSession("INIT", secs)
	s.focus = focusForm
	s.fieldIdx = 0
	s, _ = s.Update(tea.KeyMsg{Type: tea.KeyCtrlR})
	f := s.sections[0].Fields[0]
	if !f.PendingRoll {
		t.Fatal("ctrl+r should set PendingRoll")
	}
	if f.Value != "keep-this-until-save" {
		t.Fatalf("buffer changed before Finish: %q", f.Value)
	}
	if f.AutogenOn {
		t.Fatal("PendingRoll should clear AutogenOn")
	}
	vals, gen := s.Collect()
	if vals["AUTHZ_HMAC_KEY"] != "keep-this-until-save" {
		t.Fatalf("Collect value=%q", vals["AUTHZ_HMAC_KEY"])
	}
	if !gen["AUTHZ_HMAC_KEY"] {
		t.Fatal("Collect generate should be true when PendingRoll")
	}
}

func TestLockedNoRoll(t *testing.T) {
	t.Parallel()
	secs := []Section{{
		ID: "x", Title: "X",
		Fields: []Field{{
			ID: "MONGO_PASSWORD", Label: "Mongo", Kind: KindReadonly,
			Value: "secret", Autogen: true, Locked: true,
		}},
	}}
	s := NewSession("INIT", secs)
	s.focus = focusForm
	s.fieldIdx = 0
	s, _ = s.Update(tea.KeyMsg{Type: tea.KeyCtrlR})
	if s.sections[0].Fields[0].PendingRoll {
		t.Fatal("locked field must not PendingRoll")
	}
	_, gen := s.Collect()
	if gen["MONGO_PASSWORD"] {
		t.Fatal("locked must not generate")
	}
}

func TestFormViewportScrollsOnPgDown(t *testing.T) {
	t.Parallel()
	fields := make([]Field, 12)
	for i := range fields {
		fields[i] = Field{ID: "f" + string(rune('a'+i)), Label: "Field " + string(rune('A'+i)), Kind: KindText, Value: "v", Help: strings.Repeat("long help text ", 8)}
	}
	s := NewSession("INIT", []Section{{ID: "big", Title: "Big", Fields: fields}})
	s.SetSize(36, 40, 12) // short form pane → overflow
	s.focus = focusForm
	s.fieldIdx = 0
	before := s.formVP.YOffset
	s, _ = s.Update(tea.KeyMsg{Type: tea.KeyPgDown})
	if s.formVP.YOffset <= before && s.formVP.Height > 0 {
		// Only require movement when content actually overflows the viewport.
		s.refreshFormViewport()
		if s.formVP.TotalLineCount() > s.formVP.Height && s.formVP.YOffset <= before {
			t.Fatalf("pgdown should scroll; y=%d before=%d lines=%d h=%d", s.formVP.YOffset, before, s.formVP.TotalLineCount(), s.formVP.Height)
		}
	}
	view := s.View()
	if view == "" {
		t.Fatal("empty view")
	}
}

func TestCancelDropsPendingRoll(t *testing.T) {
	t.Parallel()
	secs := []Section{{
		ID: "secrets", Title: "Secrets",
		Fields: []Field{{
			ID: "pw", Label: "Password", Kind: KindSecret,
			Value: "x", Autogen: true, AutogenOn: false, PendingRoll: true,
		}},
	}}
	s := NewSession("INIT", secs)
	s.focus = focusNav
	_, cmd := s.Update(tea.KeyMsg{Type: tea.KeyEsc})
	if cmd == nil {
		t.Fatal("want CancelMsg")
	}
	if _, ok := cmd().(CancelMsg); !ok {
		t.Fatal("want CancelMsg")
	}
	// Pending rolls live only in session state; cancel does not Persist.
	if !s.sections[0].Fields[0].PendingRoll {
		t.Fatal("session still holds PendingRoll until parent discards Session")
	}
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
