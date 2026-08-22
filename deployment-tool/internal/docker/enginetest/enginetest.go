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

	"github.com/moby/moby/api/types/swarm"
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

	// ServiceUpdates records POST /services/{id}/update bodies (oldest first).
	ServiceUpdates []ServiceUpdateCall
	// ServiceUpdateStatus overrides the HTTP status for updates (0 → 200).
	ServiceUpdateStatus int
	// ServiceUpdateBody overrides the JSON response (empty → {}).
	ServiceUpdateBody string

	// ContainerList is the GET /containers/json queue: each call pops the
	// next entry, and the last entry repeats once drained. Empty → [].
	ContainerList []Response
}

// ServiceUpdateCall is one captured ServiceUpdate request.
type ServiceUpdateCall struct {
	ID      string
	Version string
	Spec    swarm.ServiceSpec
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
	e.srv = httptest.NewTestServer(t, http.HandlerFunc(e.serve))
	t.Cleanup(e.srv.Close)
	return e
}

// APIClient returns a Moby client aimed at this Engine (fixed API version, no host resolve).
func (e *Engine) APIClient() *client.Client {
	e.t.Helper()
	// NewTestServer is in-memory: no URL/listener. Give the client a
	// placeholder host and route every request through the server's client.
	apiClient, err := client.New(
		client.WithHost("http://enginetest.invalid"),
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

// SetServiceOK registers a minimal Swarm service inspect body under name (and ID when set).
func (e *Engine) SetServiceOK(name string, svc swarm.Service) {
	e.t.Helper()
	if svc.ID == "" {
		svc.ID = name + "-id"
	}
	if svc.Spec.Name == "" {
		svc.Spec.Name = name
	}
	body, err := json.Marshal(svc)
	if err != nil {
		e.t.Fatalf("enginetest SetServiceOK: %v", err)
	}
	e.SetServiceInspect(name, http.StatusOK, string(body))
	if svc.ID != name {
		e.SetServiceInspect(svc.ID, http.StatusOK, string(body))
	}
}

// SetContainerList makes every GET /containers/json return these containers.
func (e *Engine) SetContainerList(names ...string) {
	e.t.Helper()
	e.mu.Lock()
	defer e.mu.Unlock()
	e.ContainerList = []Response{{Status: http.StatusOK, Body: containersJSON(names)}}
}

// QueueContainerList appends one GET /containers/json result. Queued entries
// are returned in order so a poll loop can observe the set changing; the final
// entry repeats once the queue is drained.
func (e *Engine) QueueContainerList(names ...string) {
	e.t.Helper()
	e.mu.Lock()
	defer e.mu.Unlock()
	e.ContainerList = append(e.ContainerList, Response{Status: http.StatusOK, Body: containersJSON(names)})
}

// containersJSON renders a minimal /containers/json body, one entry per name.
func containersJSON(names []string) string {
	items := make([]map[string]any, 0, len(names))
	for _, n := range names {
		items = append(items, map[string]any{"Id": n + "-id", "Names": []string{"/" + n}})
	}
	b, _ := json.Marshal(items)
	return string(b)
}

// LastServiceUpdate returns the most recent update call, or ok=false.
func (e *Engine) LastServiceUpdate() (ServiceUpdateCall, bool) {
	e.mu.Lock()
	defer e.mu.Unlock()
	if len(e.ServiceUpdates) == 0 {
		return ServiceUpdateCall{}, false
	}
	return e.ServiceUpdates[len(e.ServiceUpdates)-1], true
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
	case r.Method == http.MethodPost && strings.HasPrefix(path, "/services/") && strings.HasSuffix(path, "/update"):
		id := strings.TrimPrefix(path, "/services/")
		id = strings.TrimSuffix(id, "/update")
		raw, err := io.ReadAll(r.Body)
		if err != nil {
			http.Error(w, `{"message":"read body"}`, http.StatusBadRequest)
			return
		}
		var spec swarm.ServiceSpec
		if len(raw) > 0 {
			if err := json.Unmarshal(raw, &spec); err != nil {
				http.Error(w, `{"message":"bad service spec"}`, http.StatusBadRequest)
				return
			}
		}
		e.mu.Lock()
		e.ServiceUpdates = append(e.ServiceUpdates, ServiceUpdateCall{
			ID:      id,
			Version: r.URL.Query().Get("version"),
			Spec:    spec,
		})
		status := e.ServiceUpdateStatus
		body := e.ServiceUpdateBody
		e.mu.Unlock()
		if status == 0 {
			status = http.StatusOK
		}
		if body == "" {
			body = `{}`
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		_, _ = io.WriteString(w, body)
		return
	case r.Method == http.MethodGet && path == "/containers/json":
		e.mu.Lock()
		var resp Response
		switch len(e.ContainerList) {
		case 0:
			resp = Response{Status: http.StatusOK, Body: "[]"}
		case 1:
			resp = e.ContainerList[0] // last entry repeats
		default:
			resp, e.ContainerList = e.ContainerList[0], e.ContainerList[1:]
		}
		e.mu.Unlock()
		status := resp.Status
		if status == 0 {
			status = http.StatusOK
		}
		body := resp.Body
		if body == "" {
			body = "[]"
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		_, _ = io.WriteString(w, body)
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
