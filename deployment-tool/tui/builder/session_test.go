package builder

import (
	"reflect"
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"
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

func keyEsc() tea.KeyPressMsg     { return tea.KeyPressMsg{Code: tea.KeyEsc} }
func keyCtrlS() tea.KeyPressMsg   { return tea.KeyPressMsg{Code: 's', Mod: tea.ModCtrl} }
func keyCtrlR() tea.KeyPressMsg   { return tea.KeyPressMsg{Code: 'r', Mod: tea.ModCtrl} }
func keySpace() tea.KeyPressMsg   { return tea.KeyPressMsg{Text: " ", Code: ' '} }
func keyPgDown() tea.KeyPressMsg  { return tea.KeyPressMsg{Code: tea.KeyPgDown} }

// applyUpdate runs Update and drainsCmds (huh navigates via NextField cmds).
func applyUpdate(s Session, msg tea.Msg) Session {
	s, cmd := s.Update(msg)
	for i := 0; cmd != nil && i < 32; i++ {
		next := cmd()
		if next == nil {
			break
		}
		s, cmd = s.Update(next)
	}
	return s
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

func TestSetSizeSameDimsNoRebuild(t *testing.T) {
	t.Parallel()
	s := NewSession("INIT", stubSections())
	_ = s.SetSize(36, 60, 12)
	form := s.form
	if form == nil {
		t.Fatal("first SetSize should build a form")
	}
	if cmd := s.SetSize(36, 60, 12); cmd != nil {
		t.Fatal("same geometry must not rebuild (avoids WindowSize spin)")
	}
	if s.form != form {
		t.Fatal("form pointer changed on no-op SetSize")
	}
}

func TestRebuildFormSettlesWithoutWindowSize(t *testing.T) {
	t.Parallel()
	s := NewSession("INIT", stubSections())
	_ = s.SetSize(36, 60, 12)
	if cmd := s.rebuildForm(); cmd != nil {
		t.Fatal("rebuildForm settles Init synchronously; should return nil")
	}
	if s.form == nil || s.form.View() == "" {
		t.Fatal("settled form should have a non-empty View")
	}
	if s.Init() != nil {
		t.Fatal("Session.Init should be a no-op after settle")
	}
}

func TestConfigSectionFormNotBlank(t *testing.T) {
	t.Parallel()
	secs := []Section{{
		ID: "obs", Title: "Observability",
		Fields: []Field{
			{ID: "obs.enabled", Label: "Enable observability", Kind: KindBool, Value: "true"},
			{ID: "obs.retention", Label: "Retention days", Kind: KindText, Value: "14"},
		},
	}}
	s := NewSession("SETTINGS", secs)
	_ = s.SetSize(40, 70, 24)
	// Stay on nav (as openSettingsBuilder does) — form must still render.
	s.focus = focusNav
	view := s.form.View()
	if !strings.Contains(view, "Enable observability") && !strings.Contains(view, "Retention") {
		t.Fatalf("config form blank while nav focused: %q", strings.Join(strings.Fields(view), " "))
	}
}

func cmdHasWindowSizeRequest(cmd tea.Cmd) bool {
	if cmd == nil {
		return false
	}
	if isWindowSizeRequest(cmd) {
		return true
	}
	msg := cmd()
	if msg == nil {
		return false
	}
	if isWindowSizeMsg(msg) {
		return true
	}
	if batch, ok := msg.(tea.BatchMsg); ok {
		for _, c := range batch {
			if cmdHasWindowSizeRequest(c) {
				return true
			}
		}
		return false
	}
	rv := reflect.ValueOf(msg)
	if rv.Kind() == reflect.Slice && rv.Type().Elem() == reflect.TypeOf((tea.Cmd)(nil)) {
		for i := 0; i < rv.Len(); i++ {
			c, _ := rv.Index(i).Interface().(tea.Cmd)
			if cmdHasWindowSizeRequest(c) {
				return true
			}
		}
	}
	return false
}

func TestCancelFromNav(t *testing.T) {
	t.Parallel()
	s := NewSession("INIT", stubSections())
	s.focus = focusNav
	var got tea.Msg
	_, cmd := s.Update(keyEsc())
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
	s, _ = s.Update(keyEsc())
	if s.FocusForm() {
		t.Fatal("still on form")
	}
}

func TestDoneMsg(t *testing.T) {
	t.Parallel()
	s := NewSession("INIT", stubSections())
	_, cmd := s.Update(keyCtrlS())
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

func drainCmd(s Session, cmd tea.Cmd) Session {
	for i := 0; cmd != nil && i < 64; i++ {
		next := cmd()
		if next == nil {
			break
		}
		s, cmd = s.Update(next)
	}
	return s
}

func TestSpaceTogglesAutogen(t *testing.T) {
	t.Parallel()
	s := NewSession("INIT", stubSections())
	s = drainCmd(s, s.SetSize(36, 60, 24))
	s = drainCmd(s, s.selectSection(1))
	s.focus = focusForm
	s.fieldIdx = 0
	s = drainCmd(s, s.rebuildForm())
	if !s.sections[1].Fields[0].AutogenOn {
		t.Fatal("stub starts AutogenOn")
	}
	viewOn := s.form.View()
	if !strings.Contains(viewOn, "will be generated") {
		t.Fatalf("Autogen on should hide typing box")
	}
	if strings.Contains(viewOn, "Value") {
		t.Fatal("Autogen on must not show Value input")
	}
	s = applyUpdate(s, keySpace())
	if s.sections[1].Fields[0].AutogenOn {
		t.Fatal("space should uncheck Autogen")
	}
	viewOff := s.form.View()
	if strings.Contains(viewOff, "will be generated") {
		t.Fatal("Autogen off should show typing box, not generate note")
	}
	if !strings.Contains(viewOff, "Value") {
		t.Fatal("Autogen off should show Value input")
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
	s, _ = s.Update(keySpace())
	if s.sections[0].Fields[0].AutogenOn {
		t.Fatal("locked field must not toggle Autogen")
	}
}

func TestCtrlRPendingRollKeepsBuffer(t *testing.T) {
	t.Parallel()
	secs := []Section{{
		ID: "secrets", Title: "Secrets",
		Fields: []Field{{
			ID: "AUTHZ_HMAC_KEY", Label: "HMAC", Kind: KindReadonly,
			Value: "keep-this-until-save", AllowRoll: true,
		}},
	}}
	s := NewSession("INIT", secs)
	s.focus = focusForm
	s.fieldIdx = 0
	s, _ = s.Update(keyCtrlR())
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
	s, _ = s.Update(keyCtrlR())
	if s.sections[0].Fields[0].PendingRoll {
		t.Fatal("locked field must not PendingRoll")
	}
	_, gen := s.Collect()
	if gen["MONGO_PASSWORD"] {
		t.Fatal("locked must not generate")
	}
}

func TestHuhFormRendersManyFields(t *testing.T) {
	t.Parallel()
	fields := make([]Field, 12)
	for i := range fields {
		fields[i] = Field{ID: "f" + string(rune('a'+i)), Label: "Field " + string(rune('A'+i)), Kind: KindText, Value: "v", Help: strings.Repeat("long help text ", 8)}
	}
	s := NewSession("INIT", []Section{{ID: "big", Title: "Big", Fields: fields}})
	s.SetSize(36, 40, 12)
	s.focus = focusForm
	s, _ = s.Update(keyPgDown())
	view := s.View()
	if view == "" || !strings.Contains(view, "Finish") {
		t.Fatalf("expected huh form + Finish: %q", view[:min(200, len(view))])
	}
}

func TestFinishTabAndEnter(t *testing.T) {
	t.Parallel()
	s := NewSession("INIT", stubSections())
	s.SetSize(36, 60, 24)
	s.focus = focusForm
	_ = s.focusField(0)
	// Advance through huh fields until last Tab completes → Finish.
	for range 8 {
		if s.finishFocused {
			break
		}
		s = applyUpdate(s, tea.KeyPressMsg{Code: tea.KeyTab})
	}
	if !s.finishFocused {
		t.Fatal("tab past last field should focus Finish")
	}
	if !strings.Contains(s.formBodyView(), "[ Finish ]") {
		t.Fatal("Finish control missing from form")
	}
	_, cmd := s.Update(tea.KeyPressMsg{Code: tea.KeyEnter})
	if cmd == nil {
		t.Fatal("enter on Finish should emit DoneMsg")
	}
	if _, ok := cmd().(DoneMsg); !ok {
		t.Fatalf("want DoneMsg, got %T", cmd())
	}
}

func TestCopyFocusedAndPaste(t *testing.T) {
	t.Parallel()
	s := NewSession("INIT", stubSections())
	_ = s.SetSize(36, 60, 20)
	s.focus = focusForm
	_ = s.focusField(1)
	if len(s.binds.values) < 2 {
		t.Fatal("binds")
	}
	s.binds.values[1] = "clip-me"
	cmd := s.CopyFocused()
	if cmd == nil {
		t.Fatal("want SetClipboard")
	}
	// Paste into form path.
	s2, _ := s.Update(tea.PasteMsg{Content: "-extra"})
	if s2.form == nil {
		t.Fatal("form gone after paste")
	}
}

func TestSetSizePreservesEdits(t *testing.T) {
	t.Parallel()
	s := NewSession("INIT", stubSections())
	_ = s.SetSize(36, 60, 20)
	s.focus = focusForm
	_ = s.focusField(1) // note
	if len(s.binds.values) < 2 {
		t.Fatal("expected binds for note field")
	}
	s.binds.values[1] = "typed-before-resize"
	_ = s.SetSize(40, 70, 22)
	vals, _ := s.Collect()
	if vals["note"] != "typed-before-resize" {
		t.Fatalf("resize dropped edit: %q", vals["note"])
	}
}

func TestCancelDropsPendingRoll(t *testing.T) {
	t.Parallel()
	secs := []Section{{
		ID: "secrets", Title: "Secrets",
		Fields: []Field{{
			ID: "pw", Label: "Password", Kind: KindReadonly,
			Value: "x", AllowRoll: true, PendingRoll: true,
		}},
	}}
	s := NewSession("INIT", secs)
	s.focus = focusNav
	_, cmd := s.Update(keyEsc())
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
