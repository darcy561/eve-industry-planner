package main

import (
	"context"
	"os"
	"slices"
	"strings"
	"testing"

	"eve-industry-planner/shared/lifecycle"
)

// The worker must stop taking work before it loses the ability to do it.
//
// Stops run in reverse registration order, and registration order is the order
// the start phases run in, so the phase sequence is what decides the stop
// sequence. Intake is started last so that it stops first: with it still pulling
// after the asynq client had closed, every message in flight would fail to
// enqueue and come back on redelivery — a clean stop would manufacture an error
// burst indistinguishable from a fault.
//
// This reads run() rather than executing it: the phases open Mongo, Redis, NATS
// and an object store. It therefore guards the phase order and not a runner moved
// between phases — see the gap noted in the worker-runtime plan.
func TestIntakeStartsLastSoItStopsFirst(t *testing.T) {
	t.Parallel()

	source, err := os.ReadFile("main.go")
	if err != nil {
		t.Fatal(err)
	}
	body := string(source)
	start := strings.Index(body, "[]func(context.Context) error{")
	if start < 0 {
		t.Fatal("run() no longer lists its phases as a slice; this guard needs rewriting")
	}
	end := strings.Index(body[start:], "}")
	if end < 0 {
		t.Fatal("could not find the end of the phase list")
	}

	var phases []string
	for line := range strings.SplitSeq(body[start:start+end], "\n") {
		if name, ok := strings.CutPrefix(strings.TrimSpace(line), "a."); ok {
			phases = append(phases, strings.TrimSuffix(name, ","))
		}
	}
	if len(phases) == 0 {
		t.Fatal("no phases found; this guard needs rewriting")
	}

	asynq := slices.Index(phases, "startAsynq")
	intake := slices.Index(phases, "startSubscribers")
	if asynq < 0 || intake < 0 {
		t.Fatalf("phases are %v; expected startAsynq and startSubscribers among them", phases)
	}
	if intake < asynq {
		t.Errorf("phases are %v: intake starts before the asynq server, so on shutdown it would "+
			"still be pulling after the server had gone", phases)
	}
}

// The order itself, stated as the sequence the worker's registrations produce.
// Stage A inverted this: telemetry used to go first and the asynq client closed
// while the subscriber was still handing it work.
func TestTheWorkerStopSequenceIsIntakeThenDrainThenTelemetry(t *testing.T) {
	t.Parallel()

	var stopped []string
	var g lifecycle.Group

	// Registered in the order the start phases register them.
	g.AddApp(func(context.Context) { stopped = append(stopped, "telemetry") })
	for _, name := range []string{
		"asynq-client", "esi-dispatcher", "esi-metrics",
		"probes", "bus", "asynq-server", "scheduled-tasks",
	} {
		g.Add(lifecycle.FromStop(name, func() { stopped = append(stopped, name) }))
	}

	for _, fn := range g.Cleanups() {
		fn(t.Context())
	}

	want := []string{
		"scheduled-tasks", // intake: stop taking work
		"asynq-server",    // drain what is already running
		"bus", "probes", "esi-metrics", "esi-dispatcher",
		"asynq-client", // nothing can enqueue by now
		"telemetry",    // outlives everything it records
	}
	if !slices.Equal(stopped, want) {
		t.Fatalf("stopped in order\n  %v\nwant\n  %v", stopped, want)
	}
}
