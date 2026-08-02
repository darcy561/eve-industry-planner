package kit

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestMapParsesEnv(t *testing.T) {
	t.Parallel()
	path := filepath.Join(t.TempDir(), ".env")
	body := `
# comment
MONGO_USERNAME=alice
MONGO_PASSWORD="secret value"
EMPTY=
DUPE=first
DUPE=second
`
	if err := os.WriteFile(path, []byte(body), 0o600); err != nil {
		t.Fatal(err)
	}
	m, err := Map(path)
	if err != nil {
		t.Fatal(err)
	}
	if Get(m, "MONGO_USERNAME") != "alice" {
		t.Fatalf("username %#v", m)
	}
	if Get(m, "MONGO_PASSWORD") != "secret value" {
		t.Fatalf("password %#v", m)
	}
	if Get(m, "DUPE") != "second" {
		t.Fatalf("last-wins %#v", m["DUPE"])
	}
	if Get(m, "MISSING") != "" {
		t.Fatal("missing should be empty")
	}
}

func TestTruthy(t *testing.T) {
	for _, s := range []string{"1", "true", "YES", " True "} {
		if !Truthy(s) {
			t.Fatalf("expected truthy %q", s)
		}
	}
	for _, s := range []string{"", "0", "false", "no"} {
		if Truthy(s) {
			t.Fatalf("expected falsey %q", s)
		}
	}
}

func TestMergeEnviron(t *testing.T) {
	out := MergeEnviron(map[string]string{"APP_VERSION": "1"}, map[string]string{"APP_VERSION": "2", "TAG_api": "x"})
	joined := strings.Join(out, "\n")
	if !strings.Contains(joined, "APP_VERSION=2") {
		t.Fatalf("later overlay should win: %s", joined)
	}
	if !strings.Contains(joined, "TAG_api=x") {
		t.Fatalf("missing TAG_api: %s", joined)
	}
}
