package env

import (
	"eve-industry-planner/deployment-tool/internal/kit"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestWriteMissing(t *testing.T) {
	if len(EnvFields()) == 0 {
		t.Fatal("empty EnvFields")
	}
	home := t.TempDir()
	wrote, err := WriteMissing(home)
	if err != nil || !wrote {
		t.Fatalf("env: wrote=%v err=%v", wrote, err)
	}
	wrote, err = WriteMissing(home)
	if err != nil || wrote {
		t.Fatalf("env second: wrote=%v err=%v", wrote, err)
	}
	envPath := filepath.Join(home, kit.EnvFile)
	if _, err := os.Stat(envPath); err != nil {
		t.Fatal(err)
	}
	m, err := kit.Map(envPath)
	if err != nil {
		t.Fatal(err)
	}
	if kit.Get(m, "APP_VERSION") == "" {
		t.Fatal("expected APP_VERSION from registry defaults")
	}
	hmac := kit.Get(m, "ENTITY_ID_KEY")
	if hmac == "" || hmac == AutoGenerateSentinel {
		t.Fatalf("ENTITY_ID_KEY should be generated, got %q", hmac)
	}
	raw, err := os.ReadFile(envPath)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(raw), AutoGenerateSentinel) {
		t.Fatal("WriteMissing must emit resolved Autogen secrets, not the unset sentinel")
	}
}

func TestLoadEnvValuesPreviousKeys(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	path := filepath.Join(dir, kit.EnvFile)
	// MONGO_PASSWORD carries no PreviousKeys in the registry, so the field is
	// declared here with one and resolved against a file that holds only the old
	// name — which is what a key rename looks like on disk.
	file := map[string]string{
		"LEGACY_MONGO_PW": "from-old",
		"APP_VERSION":     "9.9.9",
	}
	f := EnvField{
		Key: "MONGO_PASSWORD", Type: FieldPassword, Default: "",
		PreviousKeys: []string{"LEGACY_MONGO_PW"},
	}
	if got := resolveFieldValue(f, file); got != "from-old" {
		t.Fatalf("migrate got %q", got)
	}
	if got := resolveFieldValue(f, map[string]string{"MONGO_PASSWORD": "current"}); got != "current" {
		t.Fatalf("current wins got %q", got)
	}

	body := "APP_VERSION=1.2.3\nCUSTOM_EXTRA=keep-me\n"
	if err := os.WriteFile(path, []byte(body), 0o600); err != nil {
		t.Fatal(err)
	}
	vals, err := LoadEnvValues(path)
	if err != nil {
		t.Fatal(err)
	}
	if vals["APP_VERSION"] != "1.2.3" {
		t.Fatalf("APP_VERSION=%q", vals["APP_VERSION"])
	}
	if vals["MONGO_PASSWORD"] != "" {
		t.Fatalf("default MONGO_PASSWORD=%q want empty (Autogen fills on WriteMissing/Persist)", vals["MONGO_PASSWORD"])
	}
}

func TestEmitEnvPreservesUnrecognized(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	path := filepath.Join(dir, kit.EnvFile)
	initial := "APP_VERSION=0.1.0\nMY_CUSTOM_KEY=secret-extra\nANOTHER=1\n"
	if err := os.WriteFile(path, []byte(initial), 0o600); err != nil {
		t.Fatal(err)
	}
	vals, err := LoadEnvValues(path)
	if err != nil {
		t.Fatal(err)
	}
	vals["APP_VERSION"] = "0.2.0"
	if err := EmitEnv(path, vals); err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	s := string(raw)
	if !strings.Contains(s, "unrecognized / preserved") {
		t.Fatalf("missing preserved section:\n%s", s)
	}
	if !strings.Contains(s, "MY_CUSTOM_KEY=secret-extra") {
		t.Fatalf("missing custom key:\n%s", s)
	}
	if !strings.Contains(s, "ANOTHER=1") {
		t.Fatalf("missing ANOTHER:\n%s", s)
	}
	if !strings.Contains(s, "APP_VERSION=0.2.0") {
		t.Fatalf("missing updated version:\n%s", s)
	}
	m, err := kit.Map(path)
	if err != nil {
		t.Fatal(err)
	}
	if kit.Get(m, "MY_CUSTOM_KEY") != "secret-extra" {
		t.Fatalf("round-trip custom %#v", m)
	}
	if kit.Get(m, "APP_VERSION") != "0.2.0" {
		t.Fatalf("round-trip version %#v", m)
	}
}

func TestEmitEnvMigratesPreviousKeyName(t *testing.T) {
	t.Parallel()
	// Build bytes as if file had only a previous name; after resolve+emit current key appears
	// and previous name is not in preserved (it is known via PreviousKeys).
	f := EnvField{
		Key: "WIDGET_TOKEN", Default: "", Required: true,
		PreviousKeys: []string{"OLD_WIDGET_TOKEN"},
		Section:      "Test", Help: "test",
	}
	file := map[string]string{"OLD_WIDGET_TOKEN": "abc", "STRAY": "1"}
	val := resolveFieldValue(f, file)
	if val != "abc" {
		t.Fatalf("val=%q", val)
	}
	known := map[string]struct{}{
		"WIDGET_TOKEN":     {},
		"OLD_WIDGET_TOKEN": {},
	}
	pres := preservedKeys(file, known)
	if _, ok := pres["OLD_WIDGET_TOKEN"]; ok {
		t.Fatal("previous key should not be preserved")
	}
	if pres["STRAY"] != "1" {
		t.Fatalf("stray=%v", pres)
	}
}

func TestEmitEnvOptionalCommented(t *testing.T) {
	t.Parallel()
	raw, err := FormatEnvFile(DefaultEnvValues(), nil)
	if err != nil {
		t.Fatal(err)
	}
	s := string(raw)
	if !strings.Contains(s, "# GA4_MEASUREMENT_ID=") {
		t.Fatalf("expected commented optional GA4:\n%s", s)
	}
	if !strings.Contains(s, "LOG_LEVEL=info") {
		t.Fatalf("expected required LOG_LEVEL:\n%s", s)
	}
	if !strings.Contains(s, "REFRESH_TOKEN_AES_LEGACY_KEYS={}") {
		t.Fatalf("expected unquoted empty LEGACY_KEYS for CLI:\n%s", s)
	}
	if strings.Contains(s, `REFRESH_TOKEN_AES_LEGACY_KEYS="{}"`) || strings.Contains(s, `REFRESH_TOKEN_AES_LEGACY_KEYS='{}'`) {
		t.Fatalf("empty LEGACY_KEYS should not be quoted:\n%s", s)
	}
	if !strings.Contains(s, "Leave {} when unused") {
		t.Fatalf("expected LEGACY_KEYS structure help:\n%s", s)
	}
}

func TestFormatEnvValueQuoting(t *testing.T) {
	t.Parallel()
	cases := []struct {
		in, want string
	}{
		{"", ""},
		{"plain", "plain"},
		{"abc+/=", "abc+/="}, // AES-style; = does not force quotes
		{"{}", "{}"},
		{`{"v1":"k+/="}`, `'{"v1":"k+/="}'`},
		{"a b", `"a b"`},
		{"$x", `'$x'`},
	}
	for _, tc := range cases {
		if got := formatEnvValue(tc.in); got != tc.want {
			t.Fatalf("formatEnvValue(%q)=%s want %s", tc.in, got, tc.want)
		}
	}
}

func TestEnvFieldsUniqueKeys(t *testing.T) {
	t.Parallel()
	seen := map[string]struct{}{}
	for _, f := range EnvFields() {
		if f.Key == "" {
			t.Fatal("empty key")
		}
		if _, ok := seen[f.Key]; ok {
			t.Fatalf("duplicate key %s", f.Key)
		}
		seen[f.Key] = struct{}{}
	}
}
