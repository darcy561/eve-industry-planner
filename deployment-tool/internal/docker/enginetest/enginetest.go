// Package enginetest provides a minimal Engine API stand-in for unit tests.
//
// Default CI `go test ./…` has no daemon. Pure Diff*/Name tests never exercise
// SDK call sites (inspect error classification, ServiceUpdate wiring). Point
// github.com/moby/moby/client at this httptest server instead.
//
// Real Swarm object CRUD belongs in //go:build integration tests (Ubuntu job
// swarm init). Scope here: enough routes for the paths under test — not a full Engine.
package enginetest

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/moby/moby/client"
)

// Engine is a fake Docker Engine HTTP API.
type Engine struct {
	t   testing.TB
	srv *httptest.Server

	mu sync.Mutex
	// ServiceInspect maps service name/id → status + raw JSON body.
	// Missing keys → 404 {"message":"…"}.
	ServiceInspect map[string]Response
}

// Response is one Engine HTTP response.
type Response struct {
	Status int
	Body   string // raw JSON; empty → {"message":"…"} for errors, "{}" for 200
}

// New starts an httptest Engine. Cleanup closes the server.
func New(t testing.TB) *Engine {
	t.Helper()
	e := &Engine{
		t:              t,
		ServiceInspect: map[string]Response{},
	}
	e.srv = httptest.NewServer(http.HandlerFunc(e.serve))
	t.Cleanup(e.srv.Close)
	return e
}

// APIClient returns a Moby client aimed at this Engine (fixed API version, no host resolve).
func (e *Engine) APIClient() *client.Client {
	e.t.Helper()
	apiClient, err := client.New(
		client.WithHost(e.srv.URL),
		client.WithAPIVersion(client.MaxAPIVersion),
		client.WithHTTPClient(e.srv.Client()),
	)
	if err != nil {
		e.t.Fatalf("enginetest APIClient: %v", err)
	}
	e.t.Cleanup(func() { _ = apiClient.Close() })
	return apiClient
}

// SetServiceInspect configures GET /services/{name}.
func (e *Engine) SetServiceInspect(name string, status int, body string) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.ServiceInspect[name] = Response{Status: status, Body: body}
}

// SetServiceMissing is 404 for name (IsNotFound).
func (e *Engine) SetServiceMissing(name string) {
	e.SetServiceInspect(name, http.StatusNotFound, `{"message":"No such service: `+name+`"}`)
}

// SetServiceError is a non-404 failure (must not be treated as "not deployed").
func (e *Engine) SetServiceError(name string, status int, msg string) {
	if status == 0 {
		status = http.StatusInternalServerError
	}
	if msg == "" {
		msg = "engine unavailable"
	}
	b, _ := json.Marshal(map[string]string{"message": msg})
	e.SetServiceInspect(name, status, string(b))
}

func (e *Engine) serve(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Path
	// Strip /v1.xx prefix when present.
	if strings.HasPrefix(path, "/v") {
		if i := strings.Index(path[1:], "/"); i >= 0 {
			path = path[1+i:]
		}
	}

	switch {
	case r.Method == http.MethodGet && (path == "/_ping" || path == "/ping"):
		w.Header().Set("API-Version", client.MaxAPIVersion)
		w.WriteHeader(http.StatusOK)
		return
	case r.Method == http.MethodGet && strings.HasPrefix(path, "/services/"):
		name := strings.TrimPrefix(path, "/services/")
		name, _, _ = strings.Cut(name, "/")
		e.mu.Lock()
		resp, ok := e.ServiceInspect[name]
		e.mu.Unlock()
		if !ok {
			http.Error(w, `{"message":"No such service: `+name+`"}`, http.StatusNotFound)
			return
		}
		status := resp.Status
		if status == 0 {
			status = http.StatusOK
		}
		body := resp.Body
		if body == "" {
			if status >= 400 {
				body = `{"message":"error"}`
			} else {
				body = `{}`
			}
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		_, _ = io.WriteString(w, body)
		return
	default:
		http.Error(w, `{"message":"enginetest: unhandled `+r.Method+` `+path+`"}`, http.StatusNotImplemented)
	}
}
