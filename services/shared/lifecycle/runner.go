// Package lifecycle provides shared app-process runners and shutdown helpers
// used the same way across core, api, worker, websocket, and ws-router.
package lifecycle

import (
	"context"
)

// Runner is a long-lived unit started from main (HTTP server, primary controller, etc).
type Runner interface {
	Name() string
	Stop(ctx context.Context)
}

// Func adapts a name + stop function into a Runner.
type Func struct {
	RunnerName string
	Fn         func(ctx context.Context)
}

func (f Func) Name() string { return f.RunnerName }

func (f Func) Stop(ctx context.Context) {
	if f.Fn != nil {
		f.Fn(ctx)
	}
}

// Stops returns cleanup callbacks for WaitForShutdown / RunCleanups (app layer).
func Stops(runners ...Runner) []func(context.Context) {
	out := make([]func(context.Context), 0, len(runners))
	for _, r := range runners {
		if r == nil {
			continue
		}
		r := r
		out = append(out, func(ctx context.Context) { r.Stop(ctx) })
	}
	return out
}

// AppThenDeps orders shutdown: application runners/stops first, then dependency close.
func AppThenDeps(app []func(context.Context), stopDeps func(context.Context)) []func(context.Context) {
	out := append([]func(context.Context){}, app...)
	if stopDeps != nil {
		out = append(out, stopDeps)
	}
	return out
}

// Append copies extra cleanup funcs onto app (e.g. telemetry, metric unsubscribes).
func Append(app []func(context.Context), extra ...func(context.Context)) []func(context.Context) {
	for _, fn := range extra {
		if fn != nil {
			app = append(app, fn)
		}
	}
	return app
}

// GoCtx runs fn in a background goroutine (fire-and-forget work from main).
// Prefer this over bare go func() { ... }() at call sites.
func GoCtx(ctx context.Context, fn func(context.Context)) {
	if fn == nil {
		return
	}
	go fn(ctx)
}

// FromStop adapts a name + stop closure into a Runner.
func FromStop(name string, stop func()) Runner {
	return Func{
		RunnerName: name,
		Fn: func(context.Context) {
			if stop != nil {
				stop()
			}
		},
	}
}

// Group collects runners and optional app-level cleanups for ordered shutdown.
type Group struct {
	Runners []Runner
	App     []func(context.Context)
}

// Add appends a long-lived runner.
func (g *Group) Add(r Runner) {
	if r != nil {
		g.Runners = append(g.Runners, r)
	}
}

// AddApp appends app-layer cleanups (telemetry, metric unsubscribes).
func (g *Group) AddApp(extra ...func(context.Context)) {
	g.App = Append(g.App, extra...)
}

// Cleanups returns app stops then runner stops (deps added by caller via AppThenDeps).
func (g *Group) Cleanups() []func(context.Context) {
	return append(append([]func(context.Context){}, g.App...), Stops(g.Runners...)...)
}
