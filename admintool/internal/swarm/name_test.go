package swarm

import (
	"strings"
	"testing"
)

func TestName(t *testing.T) {
	a := Name("prometheus_yml", []byte("x"))
	b := Name("prometheus_yml", []byte("x"))
	c := Name("prometheus_yml", []byte("y"))
	if a != b {
		t.Fatalf("same content should match: %s vs %s", a, b)
	}
	if a == c {
		t.Fatalf("different content should differ")
	}
	if !strings.HasPrefix(a, "eip_prometheus_yml_") {
		t.Fatalf("prefix: %s", a)
	}
	if len(a) != len("eip_prometheus_yml_")+12 {
		t.Fatalf("hash length: %s", a)
	}
}
