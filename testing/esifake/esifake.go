// Package esifake is a stand-in for the ESI client, for testing a caller
// without a live origin or a Redis.
package esifake

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"slices"
	"sync"
	"testing"

	"eve-industry-planner/shared/esiclient"
)

// Reply is one canned answer. A zero Status means 200.
type Reply struct {
	Status int
	Body   string
	Header http.Header
	Err    error
}

// Observation is one availability report from a caller with no bucket.
type Observation struct {
	Source    string
	Reachable bool
}

// Call is one request the fake received.
type Call struct {
	Method string
	Path   string
	Class  esiclient.Class
	Auth   esiclient.Identity
	Body   []byte
	ETag   string
}

// HeadroomQuery is one budget question the fake was asked. The path matters:
// a bucket's group is learned per exact path, so asking about the wrong one
// consults a bucket the work will not spend from.
type HeadroomQuery struct {
	Path   string
	Class  esiclient.Class
	Auth   esiclient.Identity
	Tokens int
}

// Client is a fake ESI client bound to a test.
type Client struct {
	t testing.TB

	mu           sync.Mutex
	queues       map[string][]Reply
	replies      map[string]Reply
	calls        []Call
	headroom     map[esiclient.Class]esiclient.Headroom
	availability esiclient.DowntimeState
	observed     []Observation
	asked        []HeadroomQuery
}

// New returns a fake bound to t. An unmatched path answers 200 with an empty
// JSON array, so a test only states the responses it cares about.
func New(t testing.TB) *Client {
	return &Client{
		t:        t,
		queues:   map[string][]Reply{},
		replies:  map[string]Reply{},
		headroom: map[esiclient.Class]esiclient.Headroom{},
	}
}

func key(method, path string) string {
	if method == "" {
		method = http.MethodGet
	}
	return method + " " + path
}

// Set makes every matching call return r.
func (c *Client) Set(method, path string, r Reply) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.replies[key(method, path)] = r
}

// SetJSON is Set for a body and status.
func (c *Client) SetJSON(method, path string, status int, body string) {
	c.Set(method, path, Reply{Status: status, Body: body})
}

// Queue answers matching calls with each reply in turn, then falls back to
// whatever Set holds. Use it to drive a sequence — a 304 after a 200, say.
func (c *Client) Queue(method, path string, replies ...Reply) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.queues[key(method, path)] = append(c.queues[key(method, path)], replies...)
}

// SetHeadroom makes Headroom report room for a class.
func (c *Client) SetHeadroom(class esiclient.Class, room esiclient.Headroom) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.headroom[class] = room
}

// Calls is every request the fake received, in order.
func (c *Client) Calls() []Call {
	c.mu.Lock()
	defer c.mu.Unlock()
	return append([]Call(nil), c.calls...)
}

// CallsTo is the calls made to one path.
func (c *Client) CallsTo(method, path string) []Call {
	c.mu.Lock()
	defer c.mu.Unlock()
	var out []Call
	for _, call := range c.calls {
		if key(call.Method, call.Path) == key(method, path) {
			out = append(out, call)
		}
	}
	return out
}

func (c *Client) answer(req esiclient.Request) (Reply, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.calls = append(c.calls, Call{
		Method: req.Method, Path: req.Path, Class: req.Class,
		Auth: req.Auth, Body: req.Body, ETag: req.IfNoneMatch,
	})

	k := key(req.Method, req.Path)
	if queued := c.queues[k]; len(queued) > 0 {
		c.queues[k] = queued[1:]
		return queued[0], queued[0].Err
	}
	if reply, ok := c.replies[k]; ok {
		return reply, reply.Err
	}
	return Reply{Status: http.StatusOK, Body: "[]"}, nil
}

func (c *Client) response(req esiclient.Request, reply Reply) *esiclient.Response {
	status := reply.Status
	if status == 0 {
		status = http.StatusOK
	}
	header := reply.Header
	if header == nil {
		header = http.Header{}
	}
	return &esiclient.Response{
		Status:      status,
		Header:      header,
		Body:        []byte(reply.Body),
		Wire:        int64(len(reply.Body)),
		NotModified: status == http.StatusNotModified,
		ETag:        header.Get("ETag"),
		Bucket:      esiclient.BucketFor("fake", req.Auth),
		Cost:        esiclient.TokenCost(status),
	}
}

// Do answers the canned reply for this path.
func (c *Client) Do(_ context.Context, req esiclient.Request) (*esiclient.Response, error) {
	reply, err := c.answer(req)
	if err != nil {
		return nil, err
	}
	return c.response(req, reply), nil
}

// Stream answers the canned reply as a reader. Wire reports the body's length,
// since a fake has no connection to count bytes off.
func (c *Client) Stream(_ context.Context, req esiclient.Request) (*esiclient.Stream, error) {
	reply, err := c.answer(req)
	if err != nil {
		return nil, err
	}
	stream := &esiclient.Stream{
		Response: *c.response(req, reply),
		Body:     io.NopCloser(bytes.NewReader([]byte(reply.Body))),
	}
	return stream, nil
}

// Headroom reports whatever SetHeadroom stated, and generous room otherwise.
func (c *Client) Headroom(_ context.Context, path string, id esiclient.Identity, class esiclient.Class) (esiclient.Headroom, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.asked = append(c.asked, HeadroomQuery{Path: path, Class: class, Auth: id})
	if room, ok := c.headroom[class]; ok {
		return room, nil
	}
	return esiclient.Headroom{
		Bucket: esiclient.Bucket{Group: "fake", User: esiclient.AnonymousUser},
		Class:  class, Known: true, Available: 10000, Requests: 5000,
	}, nil
}

// CanAfford answers from Headroom.
func (c *Client) CanAfford(ctx context.Context, path string, id esiclient.Identity, class esiclient.Class, tokens int) (bool, esiclient.Headroom, error) {
	room, err := c.Headroom(ctx, path, id, class)
	if err != nil {
		return false, esiclient.Headroom{}, err
	}
	c.mu.Lock()
	if n := len(c.asked); n > 0 {
		c.asked[n-1].Tokens = tokens
	}
	c.mu.Unlock()
	// An undisclosed allowance affords the work, as the real store has it.
	if !room.Known {
		return true, room, nil
	}
	return room.Available >= tokens, room, nil
}

// HeadroomQueries is every budget question asked, in order.
func (c *Client) HeadroomQueries() []HeadroomQuery {
	c.mu.Lock()
	defer c.mu.Unlock()
	return slices.Clone(c.asked)
}

// Availability reports whatever SetAvailability stated, and answering servers
// otherwise.
func (c *Client) Availability(context.Context) (esiclient.DowntimeState, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.availability, nil
}

// SetAvailability makes Availability report an outage, for testing work that
// defers while the servers are away.
func (c *Client) SetAvailability(state esiclient.DowntimeState) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.availability = state
}

// Observe records what a caller with no bucket reported.
func (c *Client) Observe(_ context.Context, source string, reachable bool) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.observed = append(c.observed, Observation{Source: source, Reachable: reachable})
	return nil
}

// Observations is every availability report the fake received.
func (c *Client) Observations() []Observation {
	c.mu.Lock()
	defer c.mu.Unlock()
	return append([]Observation(nil), c.observed...)
}

// AssertCalled fails the test if path was not called the expected number of times.
func (c *Client) AssertCalled(method, path string, want int) {
	c.t.Helper()
	if got := len(c.CallsTo(method, path)); got != want {
		c.t.Errorf("%s called %d times, want %d", key(method, path), got, want)
	}
}

var _ esiclient.API = (*Client)(nil)
