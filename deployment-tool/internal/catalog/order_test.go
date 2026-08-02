package catalog

import (
	"slices"
	"testing"
)

func TestOrderPrefer(t *testing.T) {
	t.Parallel()
	got := OrderPrefer(map[string]struct{}{
		"grafana": {},
		"mongo":   {},
		"api":     {},
		"redis":   {},
	})
	want := []string{"api", "mongo", "redis", "grafana"}
	if !slices.Equal(got, want) {
		t.Fatalf("OrderPrefer=%v want %v", got, want)
	}
}

func TestOrderPreferEmpty(t *testing.T) {
	t.Parallel()
	if got := OrderPrefer(nil); got != nil {
		t.Fatalf("got %v", got)
	}
}
