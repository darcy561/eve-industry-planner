// Package orchestrationprobes serves Swarm/Docker liveness and readiness probes
// on a dedicated listener, plus an optional gated NATS health census responder.
//
// Standard HTTP paths: /healthy, /health (liveness), /ready (readiness).
// ListenAddr is fixed (:19100) — not on the public traffic mux.
package orchestrationprobes

import (
	"context"
	"net/http"
	"time"

	"eve-industry-planner/shared/lifecycle"
	"eve-industry-planner/shared/logs"
)

// ListenAddr / ListenPort are the fixed orchestration probe bind for every app role
// (container-local only). Stack healthchecks and Traefik healthcheck.port must match
// ListenPort — YAML cannot import this const; keep literals in sync.
const (
	ListenAddr = ":19100"
	ListenPort = "19100"
)

// ReadyCheck reports whether this process should accept traffic / handoff.
// Return nil for ready; any error yields 503 NOT_READY.
type ReadyCheck func(ctx context.Context) error

func mountDefaults(mux *http.ServeMux, ready ReadyCheck, registerExtra func(*http.ServeMux)) {
	mux.HandleFunc("/healthy", HealthyHandler)
	mux.HandleFunc("/health", HealthyHandler)
	mux.HandleFunc("/ready", ReadyHandler(ready))
	if registerExtra != nil {
		registerExtra(mux)
	}
}

// Start begins the dedicated probe listener on ListenAddr and returns a lifecycle.Runner.
func Start(ctx context.Context, ready ReadyCheck, registerExtra func(*http.ServeMux)) (lifecycle.Runner, error) {
	mux := http.NewServeMux()
	mountDefaults(mux, ready, registerExtra)

	srv := &http.Server{
		Addr:              ListenAddr,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}
	logs.InfoCtx(ctx, "orchestration probes listening", "addr", ListenAddr)
	return lifecycle.HTTPServer("orchestrationprobes", srv)
}

// HealthyHandler is process liveness.
func HealthyHandler(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte("OK"))
}

// ReadyHandler returns 200 OK when ready(ctx) is nil, else 503 NOT_READY.
func ReadyHandler(ready ReadyCheck) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if ready == nil {
			w.WriteHeader(http.StatusServiceUnavailable)
			_, _ = w.Write([]byte("NOT_READY"))
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
		defer cancel()
		if err := ready(ctx); err != nil {
			w.WriteHeader(http.StatusServiceUnavailable)
			_, _ = w.Write([]byte("NOT_READY"))
			return
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("OK"))
	}
}
