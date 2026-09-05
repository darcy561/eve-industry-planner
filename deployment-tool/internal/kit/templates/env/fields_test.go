package env

import (
	"strings"
	"testing"
)

func TestEnvFieldSectionsConsistent(t *testing.T) {
	t.Parallel()
	want := []string{
		"Release", "EVE SSO", "Analytics", "Database", "Encryption",
		"Runtime", "Sentry", "Integrations", "Grafana", "Observability",
	}
	var got []string
	seen := map[string]bool{}
	var last string
	for _, f := range EnvFields() {
		if f.Section == "" {
			t.Fatalf("%s: empty Section", f.Key)
		}
		if strings.ContainsAny(f.Section, "/()") {
			t.Fatalf("%s: Section %q should be a short Title Case noun (no / or parentheticals)", f.Key, f.Section)
		}
		if f.Section == last {
			continue
		}
		if seen[f.Section] {
			t.Fatalf("%s: Section %q reappears after other sections", f.Key, f.Section)
		}
		got = append(got, f.Section)
		seen[f.Section] = true
		last = f.Section
	}
	if len(got) != len(want) {
		t.Fatalf("sections=%v want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("sections[%d]=%q want %q (full got=%v)", i, got[i], want[i], got)
		}
	}
}
