package lifecycle

import (
	"context"
	"slices"
	"testing"
)

type namedRunner struct {
	name string
	log  *[]string
}

func (r namedRunner) Name() string { return r.name }
func (r namedRunner) Stop(context.Context) {
	*r.log = append(*r.log, r.name)
}

// A stop is the mirror of a start: a runner comes down before whatever it was
// built on top of, and the app-layer stops that record all of it come down last.
// Registration order alone would tear the foundations out first and leave the
// drain unobserved.
func TestCleanupsStopRunnersInReverseThenApp(t *testing.T) {
	var log []string
	var g Group

	for _, name := range []string{"deps-client", "probes", "server", "intake"} {
		g.Add(namedRunner{name: name, log: &log})
	}
	g.AddApp(func(context.Context) { log = append(log, "telemetry") })

	for _, fn := range g.Cleanups() {
		fn(t.Context())
	}

	want := []string{"intake", "server", "probes", "deps-client", "telemetry"}
	if !slices.Equal(log, want) {
		t.Fatalf("stopped in order %v, want %v", log, want)
	}
}

// Cleanups is called on both the failure and the shutdown path, so it must not
// consume or reorder the group it reads from.
func TestCleanupsDoesNotDisturbTheGroup(t *testing.T) {
	var log []string
	var g Group
	for _, name := range []string{"a", "b", "c"} {
		g.Add(namedRunner{name: name, log: &log})
	}

	for _, fn := range g.Cleanups() {
		fn(t.Context())
	}
	for _, fn := range g.Cleanups() {
		fn(t.Context())
	}

	want := []string{"c", "b", "a", "c", "b", "a"}
	if !slices.Equal(log, want) {
		t.Fatalf("second pass differed: %v, want %v", log, want)
	}
}
