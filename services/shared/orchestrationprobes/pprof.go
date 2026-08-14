package orchestrationprobes

import (
	"net/http"
	"net/http/pprof"
	"os"
	"strings"
)

// pprofEnabled is on only for ENVIRONMENT=development (local / eip dev).
// Live and other environments leave it off — no separate flag.
func pprofEnabled() bool {
	return strings.EqualFold(strings.TrimSpace(os.Getenv("ENVIRONMENT")), "development")
}

// registerPprof mounts net/http/pprof under /debug/pprof/ on the probe mux
// when ENVIRONMENT=development (container-local :19100 — not the public traffic port).
func registerPprof(mux *http.ServeMux) {
	if mux == nil || !pprofEnabled() {
		return
	}
	mux.HandleFunc("/debug/pprof/", pprof.Index)
	mux.HandleFunc("/debug/pprof/cmdline", pprof.Cmdline)
	mux.HandleFunc("/debug/pprof/profile", pprof.Profile)
	mux.HandleFunc("/debug/pprof/symbol", pprof.Symbol)
	mux.HandleFunc("/debug/pprof/trace", pprof.Trace)
	mux.Handle("/debug/pprof/allocs", pprof.Handler("allocs"))
	mux.Handle("/debug/pprof/block", pprof.Handler("block"))
	mux.Handle("/debug/pprof/goroutine", pprof.Handler("goroutine"))
	mux.Handle("/debug/pprof/heap", pprof.Handler("heap"))
	mux.Handle("/debug/pprof/mutex", pprof.Handler("mutex"))
	mux.Handle("/debug/pprof/threadcreate", pprof.Handler("threadcreate"))
}
