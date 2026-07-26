package stack

import (
	"strings"
	"testing"
)

func TestExternalizeObservabilityConfigs(t *testing.T) {
	in := `
configs:
  loki_yml:
    file: ./observability/loki/config.yaml
  other:
    file: ./local.yml
services:
  loki:
    image: x
`
	out, changed, err := externalizeObservabilityConfigs([]byte(in))
	if err != nil {
		t.Fatal(err)
	}
	if !changed {
		t.Fatal("expected change")
	}
	s := string(out)
	if strings.Contains(s, "observability/loki") {
		t.Fatalf("still has file path:\n%s", s)
	}
	if !strings.Contains(s, "eip_pending_loki_yml") {
		t.Fatalf("missing pending name:\n%s", s)
	}
	if !strings.Contains(s, "./local.yml") {
		t.Fatalf("non-obs file should remain:\n%s", s)
	}
}
