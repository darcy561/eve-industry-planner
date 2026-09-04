package esiclient

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"sync"
	"time"

	"eve-industry-planner/shared/httpclient"

	"github.com/redis/go-redis/v9"
)

// Request is one call to ESI. Path and Class are the caller's; everything about
// the bucket, the compatibility date and the pacing is resolved from them.
type Request struct {
	Method  string
	Path    string
	Query   url.Values
	Header  http.Header
	Body    []byte
	Auth    Identity
	Class   Class
	Token   string
	Retry   httpclient.Retry
	Timeout time.Duration

	// IfNoneMatch makes the call conditional, which halves what a hit costs.
	IfNoneMatch string
}

// Stream is a response whose body the caller reads and closes. Wire reports the
// compressed bytes taken off the connection, which is only final once the body
// has been read — so it is a method rather than a field.
type Stream struct {
	Response
	Body io.ReadCloser

	wire func() int64
}

// Wire is the compressed bytes read from the connection so far.
func (s *Stream) Wire() int64 {
	if s.wire == nil {
		return 0
	}
	return s.wire()
}

// Response is what ESI returned, plus which bucket it was charged to.
type Response struct {
	Status      int
	Header      http.Header
	Body        []byte
	Wire        int64
	NotModified bool
	ETag        string
	MaxAge      time.Duration
	Bucket      Bucket
	Cost        int
}

// Client makes rate-limited ESI calls. It resolves a bucket, paces through the
// dispatcher, and records what each response disclosed.
type Client struct {
	http  *httpclient.Client
	store *Store
	disp  *Dispatcher
	cfg   Config

	// groups caches what a path's bucket is called, so a steady stream of calls
	// to one endpoint neither looks the mapping up nor rewrites it each time.
	// Redis remains the shared record; this only avoids asking again.
	groups sync.Map
	// validators records which paths have answered with one, so a conditional
	// endpoint that stops sending it is caught.
	validators sync.Map
}

// New builds a client and returns the function that stops its dispatcher.
func New(rdb *redis.Client, cfg Config) (*Client, func(), error) {
	if err := cfg.Validate(); err != nil {
		return nil, nil, err
	}
	if cfg.BaseURL == "" {
		cfg.BaseURL = BaseURL
	}

	store := NewStore(rdb, cfg)
	dispatcher, stop := NewDispatcher(store, cfg)

	return &Client{
		http: httpclient.New(httpclient.Config{
			BaseURL:   cfg.BaseURL,
			Gate:      dispatcher,
			Transport: cfg.Transport,
		}),
		store: store,
		disp:  dispatcher,
		cfg:   cfg,
	}, stop, nil
}

// call is everything the gate needs, resolved once before the request starts so
// the gate does not re-derive it per attempt.
type call struct {
	bucket   Bucket
	class    Class
	policy   EndpointPolicy
	identity Identity
	path     string
	// validatorKey is finer than the path, because a paginated endpoint issues
	// one validator per page and they all share a path.
	validatorKey string
}

// validatorKey identifies the thing a validator belongs to: a page of a book
// rather than the book. The bucket and the endpoint policy stay keyed on the
// path, which is what ESI meters and what the tuning describes.
func validatorKey(path string, query url.Values) string {
	if len(query) == 0 {
		return path
	}
	return path + "?" + query.Encode()
}

type callKey struct{}

func withCall(ctx context.Context, c call) context.Context {
	return context.WithValue(ctx, callKey{}, c)
}

func callFrom(ctx context.Context) (call, bool) {
	c, ok := ctx.Value(callKey{}).(call)
	return c, ok
}

// Do makes the call and reads the whole body.
func (c *Client) Do(ctx context.Context, req Request) (*Response, error) {
	resolved, httpReq, err := c.prepare(ctx, req)
	if err != nil {
		return nil, err
	}

	resp, err := c.http.Do(withCall(ctx, resolved), httpReq)
	if err != nil {
		return nil, err
	}
	c.learn(ctx, resolved, resp.Header)

	return &Response{
		Status:      resp.Status,
		Header:      resp.Header,
		Body:        resp.Body,
		Wire:        resp.Wire,
		NotModified: resp.NotModified,
		ETag:        resp.Validators.ETag,
		MaxAge:      resp.Cache.MaxAge,
		Bucket:      bucketFromHeader(resp.Header, resolved),
		Cost:        TokenCost(resp.Status),
	}, nil
}

// Stream makes the call and hands back a reader the caller closes. Use it for a
// body large enough that holding it whole is the wrong shape.
func (c *Client) Stream(ctx context.Context, req Request) (*Stream, error) {
	resolved, httpReq, err := c.prepare(ctx, req)
	if err != nil {
		return nil, err
	}

	stream, err := c.http.Stream(withCall(ctx, resolved), httpReq)
	if err != nil {
		return nil, err
	}
	c.learn(ctx, resolved, stream.Header)

	return &Stream{
		Status:      stream.Status,
		Header:      stream.Header,
		NotModified: stream.NotModified,
		ETag:        stream.Validators.ETag,
		MaxAge:      stream.Cache.MaxAge,
		Bucket:      bucketFromHeader(stream.Header, resolved),
		Cost:        TokenCost(stream.Status),
		Body:        stream.Body,
		wire:        stream.Wire,
	}, nil
}

// Store exposes the shared limiter state for gauges and the operator CLI.
// Reading it makes no request and spends nothing.
func (c *Client) Store() *Store { return c.store }

// Availability reports whether CCP's servers are answering. Work stopped by an
// outage but not rate limited — SSO token rotation — asks this rather than
// reserving a slot it does not need.
func (c *Client) Availability(ctx context.Context) (DowntimeState, error) {
	return c.store.Downtime(ctx)
}

// Observe records an outcome from a caller with no bucket. See Store.Observe.
func (c *Client) Observe(ctx context.Context, source string, reachable bool) error {
	return c.store.Observe(ctx, source, reachable)
}

// Dispatcher is the gate this client paces through, for metric registration and
// for an operator asking what the buckets look like.
func (c *Client) Dispatcher() *Dispatcher { return c.disp }

// Headroom reports what one class may spend against the bucket a path belongs
// to, so a scheduler can decide what to publish.
func (c *Client) Headroom(ctx context.Context, path string, id Identity, class Class) (Headroom, error) {
	bucket, err := c.bucketFor(ctx, path, id)
	if err != nil {
		return Headroom{}, err
	}
	return c.store.Headroom(ctx, bucket, class)
}

// CanAfford is Headroom against a threshold.
func (c *Client) CanAfford(ctx context.Context, path string, id Identity, class Class, tokens int) (bool, Headroom, error) {
	bucket, err := c.bucketFor(ctx, path, id)
	if err != nil {
		return false, Headroom{}, err
	}
	return c.store.CanAfford(ctx, bucket, class, tokens)
}

func (c *Client) prepare(ctx context.Context, req Request) (call, httpclient.Request, error) {
	if req.Path == "" {
		return call{}, httpclient.Request{}, fmt.Errorf("esiclient: request has no path")
	}

	policy, found := c.cfg.PolicyFor(req.Path)

	// A conditional endpoint must reuse the validator it was given. The first
	// fetch of a path has none, so the rule is not "always send one" but "having
	// been given one, do not throw it away" — which is the mistake worth
	// catching, since a dropped ETag doubles what every pass costs.
	if found && policy.Conditional && req.IfNoneMatch == "" {
		if _, seen := c.validators.Load(validatorKey(req.Path, req.Query)); seen {
			return call{}, httpclient.Request{}, fmt.Errorf(
				"esiclient: %s answered with a validator before and this call carries none; "+
					"a 304 costs one token against a 2xx's two", req.Path)
		}
	}

	class := req.Class
	if found && req.Class == ClassBackground && policy.Class != ClassBackground {
		class = policy.Class
	}

	bucket, err := c.bucketFor(ctx, req.Path, req.Auth)
	if err != nil {
		return call{}, httpclient.Request{}, err
	}

	header := http.Header{}
	maps := req.Header
	for key, values := range maps {
		for _, value := range values {
			header.Add(key, value)
		}
	}
	if policy.CompatibilityDate != "" {
		header.Set("X-Compatibility-Date", policy.CompatibilityDate)
	}
	if req.Token != "" {
		header.Set("Authorization", "Bearer "+req.Token)
	}

	return call{
		bucket:       bucket,
		class:        class,
		policy:       policy,
		identity:     req.Auth,
		path:         req.Path,
		validatorKey: validatorKey(req.Path, req.Query),
	}, httpclient.Request{
		Method:      req.Method,
		Path:        req.Path,
		Query:       req.Query,
		Header:      header,
		Body:        req.Body,
		IfNoneMatch: req.IfNoneMatch,
		Retry:       req.Retry,
		Timeout:     req.Timeout,
	}, nil
}

// bucketFor names the bucket a call will be charged to. The group is whatever a
// previous response disclosed; before that there is a placeholder, which the
// store treats as undiscovered and probes exactly once.
func (c *Client) bucketFor(ctx context.Context, path string, id Identity) (Bucket, error) {
	if cached, ok := c.groups.Load(path); ok {
		return BucketFor(cached.(string), id), nil
	}

	group, found, err := c.store.GroupFor(ctx, path)
	if err != nil {
		return Bucket{}, err
	}
	if !found {
		return BucketFor(unknownGroup(path), id), nil
	}
	c.groups.Store(path, group)
	return BucketFor(group, id), nil
}

// unknownGroup names a bucket for a path whose real group has not been seen. It
// is deliberately per path: two paths that turn out to share a group will
// converge on it once either has answered.
func unknownGroup(path string) string { return unknownGroupPrefix + path }

func (c *Client) learn(ctx context.Context, resolved call, header http.Header) {
	if header.Get("ETag") != "" || header.Get("Last-Modified") != "" {
		c.validators.Store(resolved.validatorKey, struct{}{})
	}

	group := header.Get("X-Ratelimit-Group")
	if group == "" {
		return
	}
	if known, ok := c.groups.Load(resolved.path); ok && known.(string) == group {
		return
	}
	c.groups.Store(resolved.path, group)
	_ = c.store.LearnGroup(context.WithoutCancel(ctx), resolved.path, group)
}

func bucketFromHeader(header http.Header, resolved call) Bucket {
	return disclosedBucket(&httpclient.Response{Header: header}, resolved.bucket)
}

// disclosedBucket is the bucket a response says it was charged to, falling back
// to the one we guessed when it says nothing.
func disclosedBucket(resp *httpclient.Response, guessed Bucket) Bucket {
	if resp == nil {
		return guessed
	}
	group := resp.Header.Get("X-Ratelimit-Group")
	if group == "" {
		return guessed
	}
	return Bucket{Group: group, User: guessed.User}
}

// outcomeFrom reads what a response disclosed about its bucket.
func outcomeFrom(resp *httpclient.Response) Outcome {
	out := Outcome{
		Attempted:  true,
		Status:     resp.Status,
		Cost:       TokenCost(resp.Status),
		ObservedAt: time.Now(),
		Remaining:  -1,
	}

	if limit, window, ok := ParseLimit(resp.Header.Get("X-Ratelimit-Limit")); ok {
		out.Limit = limit
		out.Window = window
		out.Metered = true
	}
	if remaining, err := strconv.Atoi(resp.Header.Get("X-Ratelimit-Remaining")); err == nil {
		out.Remaining = remaining
	}
	if seconds, err := strconv.Atoi(resp.Header.Get("Retry-After")); err == nil && seconds > 0 {
		out.RetryAfter = time.Duration(seconds) * time.Second
	}
	return out
}
