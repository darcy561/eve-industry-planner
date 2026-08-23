// Package httpfake stands in for an HTTP dependency a package under test calls out to.
//
// The server is in-memory (httptest.NewTestServer): no listener, no loopback
// socket. That keeps it usable inside a testing/synctest bubble, where real
// network I/O never counts as durably blocked and would deadlock the test.
// Callers reach it through Client, not a URL.
//
// Scope is one dependency's routes for the paths under test, not a faithful
// implementation of the far side.
package httpfake

import (
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"sync"
	"testing"
)

// Response is one canned HTTP reply. A zero Status means 200; an empty Body
// means no body is written.
type Response struct {
	Status int
	Body   string
	Header http.Header
}

// Call is one request the fake received.
type Call struct {
	Method string
	Path   string
	Query  url.Values
	Body   []byte
	Header http.Header
}

// Server is a fake HTTP dependency bound to a test.
type Server struct {
	t   testing.TB
	srv *httptest.Server

	// RewritePath normalises the request path before route lookup — e.g. to
	// strip an API version prefix the client adds. Nil leaves paths as sent.
	RewritePath func(string) string

	mu       sync.Mutex
	queues   map[string][]Response
	handlers map[string]http.HandlerFunc
	calls    []Call
}

// New starts a fake bound to t; cleanup closes it.
func New(t testing.TB) *Server {
	t.Helper()
	s := &Server{
		t:        t,
		queues:   map[string][]Response{},
		handlers: map[string]http.HandlerFunc{},
	}
	s.srv = httptest.NewTestServer(t, http.HandlerFunc(s.serve))
	t.Cleanup(s.srv.Close)
	return s
}

// Client returns an http.Client whose transport reaches this fake. The server
// has no address, so a client built any other way cannot reach it.
func (s *Server) Client() *http.Client { return s.srv.Client() }

// BaseURL is a placeholder host for callers that must be handed a URL string.
// It resolves only through Client.
func (s *Server) BaseURL() string { return "http://httpfake.invalid" }

// Set makes every matching request return r.
func (s *Server) Set(method, path string, r Response) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.queues[key(method, path)] = []Response{r}
}

// SetJSON is Set with a JSON content type.
func (s *Server) SetJSON(method, path string, status int, body string) {
	h := http.Header{}
	h.Set("Content-Type", "application/json")
	s.Set(method, path, Response{Status: status, Body: body, Header: h})
}

// Queue appends replies returned one per request, in order. Once drained the
// last entry repeats, so a poll loop can watch a value change and then settle.
func (s *Server) Queue(method, path string, rs ...Response) {
	s.mu.Lock()
	defer s.mu.Unlock()
	k := key(method, path)
	s.queues[k] = append(s.queues[k], rs...)
}

// Handle registers a handler for routes a canned Response cannot express.
// It takes precedence over Set and Queue for the same route.
func (s *Server) Handle(method, path string, h http.HandlerFunc) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.handlers[key(method, path)] = h
}

// Calls returns every request received, oldest first.
func (s *Server) Calls() []Call {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]Call(nil), s.calls...)
}

// CallsTo returns the requests received for one route, oldest first.
func (s *Server) CallsTo(method, path string) []Call {
	var out []Call
	for _, c := range s.Calls() {
		if c.Method == method && c.Path == path {
			out = append(out, c)
		}
	}
	return out
}

// Last returns the most recent request for a route.
func (s *Server) Last(method, path string) (Call, bool) {
	calls := s.CallsTo(method, path)
	if len(calls) == 0 {
		return Call{}, false
	}
	return calls[len(calls)-1], true
}

func key(method, path string) string { return method + " " + path }

func (s *Server) serve(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Path
	if s.RewritePath != nil {
		path = s.RewritePath(path)
	}
	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "httpfake: read body: "+err.Error(), http.StatusBadRequest)
		return
	}

	k := key(r.Method, path)
	s.mu.Lock()
	s.calls = append(s.calls, Call{
		Method: r.Method,
		Path:   path,
		Query:  r.URL.Query(),
		Body:   body,
		Header: r.Header.Clone(),
	})
	handler := s.handlers[k]
	var resp Response
	queued := s.queues[k]
	switch {
	case handler != nil:
	case len(queued) == 0:
		s.mu.Unlock()
		http.Error(w, "httpfake: no route for "+k, http.StatusNotImplemented)
		return
	case len(queued) == 1:
		resp = queued[0] // last entry repeats
	default:
		resp, s.queues[k] = queued[0], queued[1:]
	}
	s.mu.Unlock()

	if handler != nil {
		handler(w, r)
		return
	}
	for name, values := range resp.Header {
		for _, v := range values {
			w.Header().Add(name, v)
		}
	}
	status := resp.Status
	if status == 0 {
		status = http.StatusOK
	}
	w.WriteHeader(status)
	if resp.Body != "" {
		_, _ = io.WriteString(w, resp.Body)
	}
}
