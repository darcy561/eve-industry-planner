package env

import (
	"encoding/base64"
	"strings"
	"testing"
)

func TestGeneratePasswordHMACCharset(t *testing.T) {
	t.Parallel()
	for _, typ := range []FieldType{FieldPassword, FieldHMAC} {
		for i := 0; i < 5; i++ {
			s, err := Generate(typ)
			if err != nil {
				t.Fatal(err)
			}
			if err := Validate(typ, s); err != nil {
				t.Fatalf("generated invalid %v: %v (%q)", typ, err, s)
			}
			if strings.ContainsAny(s, "$+/") {
				t.Fatalf("unexpected charset in %q", s)
			}
		}
	}
}

func TestGenerateAES(t *testing.T) {
	t.Parallel()
	s, err := Generate(FieldAES)
	if err != nil {
		t.Fatal(err)
	}
	if err := Validate(FieldAES, s); err != nil {
		t.Fatal(err)
	}
	raw, err := base64.StdEncoding.DecodeString(s)
	if err != nil || len(raw) != 32 {
		t.Fatalf("want 32 bytes, got len=%d err=%v", len(raw), err)
	}
}

func TestResolveFieldCheckbox(t *testing.T) {
	t.Parallel()
	f := EnvField{Key: "X", Type: FieldPassword, Autogen: true, Required: true}
	got, err := ResolveField(f, "ignored", true)
	if err != nil {
		t.Fatal(err)
	}
	if err := Validate(FieldPassword, got); err != nil {
		t.Fatal(err)
	}
	custom, err := Generate(FieldPassword)
	if err != nil {
		t.Fatal(err)
	}
	got, err = ResolveField(f, custom, false)
	if err != nil || got != custom {
		t.Fatalf("manual got %q err=%v", got, err)
	}
	if _, err := ResolveField(f, "short", false); err == nil {
		t.Fatal("expected invalid manual error")
	}
}

func TestResolveFieldRejectsInvalidNoGenFallback(t *testing.T) {
	t.Parallel()
	f := EnvField{Key: "X", Type: FieldPassword, Autogen: true, Required: true}
	got, err := ResolveField(f, "has$dollar$$$$$$$$$$$$$$$$", false)
	if err == nil || got != "" {
		t.Fatalf("got %q err=%v", got, err)
	}
}

func TestIsLockedInFile(t *testing.T) {
	t.Parallel()
	f := EnvField{Key: "MONGO_PASSWORD", Locked: true, Autogen: true, Type: FieldPassword}
	if IsLockedInFile(f, "") || IsLockedInFile(f, AutoGenerateSentinel) {
		t.Fatal("unset should not lock")
	}
	if !IsLockedInFile(f, "already-set-secret-value-here-ok") {
		t.Fatal("set value should lock")
	}
	unlocked := f
	unlocked.Locked = false
	if IsLockedInFile(unlocked, "already-set-secret-value-here-ok") {
		t.Fatal("Unlocked field")
	}
}

func TestResolveEnvFieldsLockedPreserved(t *testing.T) {
	t.Parallel()
	vals := DefaultEnvValues()
	vals["MONGO_PASSWORD"] = "existing-mongo-password-value-32ch"
	// even if generate map asks to gen, locked+set keeps value
	out, err := ResolveEnvFields(vals, map[string]bool{"MONGO_PASSWORD": true})
	if err != nil {
		t.Fatal(err)
	}
	if out["MONGO_PASSWORD"] != vals["MONGO_PASSWORD"] {
		t.Fatalf("locked changed: %q", out["MONGO_PASSWORD"])
	}
}

func TestResolveEnvFieldsCheckboxGenerate(t *testing.T) {
	t.Parallel()
	vals := DefaultEnvValues()
	gen := map[string]bool{}
	for _, f := range EnvFields() {
		if f.Autogen && f.Required {
			gen[f.Key] = true
		}
	}
	out, err := ResolveEnvFields(vals, gen)
	if err != nil {
		t.Fatal(err)
	}
	for _, f := range EnvFields() {
		if !f.Autogen || !f.Required {
			continue
		}
		if out[f.Key] == AutoGenerateSentinel || out[f.Key] == "" {
			t.Fatalf("%s not generated", f.Key)
		}
		if err := Validate(f.Type, out[f.Key]); err != nil {
			t.Fatalf("%s: %v", f.Key, err)
		}
	}
}

func TestClassifyAutogenCheckbox(t *testing.T) {
	t.Parallel()
	f := EnvField{Key: "X", Type: FieldPassword, Autogen: true, Required: true, Locked: true}
	st, _ := ClassifyAutogenCheckbox(f, "set-value-long-enough-for-lock", false, false)
	if st != AutogenLocked {
		t.Fatalf("status=%v", st)
	}
	f.Locked = false
	st, msg := ClassifyAutogenCheckbox(f, "", true, false)
	if st != AutogenWillGenerate || msg == "" {
		t.Fatalf("gen status=%v msg=%q", st, msg)
	}
	st, _ = ClassifyAutogenCheckbox(f, "bad$", false, false)
	if st != AutogenInvalid {
		t.Fatalf("status=%v", st)
	}
}

func TestRuleHelpNonEmpty(t *testing.T) {
	t.Parallel()
	for _, typ := range []FieldType{FieldPassword, FieldHMAC, FieldAES} {
		if RuleHelp(typ) == "" {
			t.Fatalf("empty RuleHelp for %v", typ)
		}
	}
}

func TestEnvFieldsAutogenFlags(t *testing.T) {
	t.Parallel()
	var lockedDB int
	for _, f := range EnvFields() {
		if f.Autogen && f.Type == FieldText {
			t.Fatalf("%s: Autogen with FieldText", f.Key)
		}
		if f.Locked {
			lockedDB++
			if !f.Autogen {
				t.Fatalf("%s locked but not Autogen", f.Key)
			}
		}
	}
	if lockedDB < 4 {
		t.Fatalf("expected mongo/redis locked passwords, got %d", lockedDB)
	}
}
