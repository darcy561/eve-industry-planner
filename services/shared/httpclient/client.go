package httpclient

import (
	"bytes"
	"cmp"
	"compress/gzip"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync/atomic"
	"time"
)

// DefaultMaxBodyBytes caps a buffered body. Read anything larger with Stream.
const DefaultMaxBodyBytes int64 = 32 << 20

// Config builds a Client. The zero value is usable: no base URL, default cap,
// shared transport, shared User-Agent.
type Config struct {
	// BaseURL is prefixed to a Request.Path that is not already absolute.
	BaseURL string
	// MaxBodyBytes caps Do; zero means DefaultMaxBodyBytes.
	MaxBodyBytes int64
	// UserAgent overrides the shared default.
	UserAgent string
	// Transport overrides the shared traced transport.
	Transport http.RoundTripper
	// Gate admits and settles every attempt, retries included. A rate limiter
	// goes here; nil means no gating.
	Gate Gate
	// OnComplete reports every finished attempt, for metrics or logging. The
	// client records neither itself.
	OnComplete func(Attempt)
}

// Client issues outbound HTTP for a service: compression, byte accounting,
// conditional requests, validator and cache parsing, retries, and the Gate that
// admits each attempt.
//
// It holds no opinion about meaning — it does not authenticate, and a 404 or 429
// comes back as a Response rather than an error.
//
// It has no timeout of its own, so a long stream is not cut short by a
// client-wide deadline. Callers bound a request with their context; waiting for
// response headers is bounded by the transport.
type Client struct {
	http         *http.Client
	baseURL      string
	maxBodyBytes int64
	userAgent    string
	gate         Gate
	onComplete   func(Attempt)
}

// New returns a Client for cfg.
func New(cfg Config) *Client {
	transport := cfg.Transport
	if transport == nil {
		transport = NewTransport()
	}
	maxBody := cfg.MaxBodyBytes
	if maxBody <= 0 {
		maxBody = DefaultMaxBodyBytes
	}
	agent := cfg.UserAgent
	if agent == "" {
		agent = DefaultHeaders()["User-Agent"]
	}
	return &Client{
		http:         &http.Client{Transport: transport},
		baseURL:      strings.TrimRight(cfg.BaseURL, "/"),
		maxBodyBytes: maxBody,
		userAgent:    agent,
		gate:         cfg.Gate,
		onComplete:   cfg.OnComplete,
	}
}

// Request is one outbound call. Only Method and Path are required.
type Request struct {
	Method string
	// Path is joined to the client's BaseURL unless it is already absolute.
	Path   string
	Query  url.Values
	Header http.Header
	Body   []byte
	// Form is sent form-encoded when Body is empty, and sets the content type.
	Form url.Values
	// Host overrides the Host header. Setting it through Header does nothing:
	// net/http writes this field or the URL's host, and ignores the rest.
	Host string
	// Timeout bounds one attempt of Do. Stream ignores it — the caller's context
	// governs a body that may be read for a long time.
	Timeout time.Duration

	// IfNoneMatch and IfModifiedSince make the call conditional. A 304 is
	// cheaper on bytes, on origin work, and on rate-limit cost where the origin
	// charges by response.
	IfNoneMatch     string
	IfModifiedSince time.Time

	// Retry sends the call again when the outcome warrants it. The zero value
	// sends once.
	Retry Retry
}

// Do sends the request and reads the whole body, decompressed.
//
// A non-2xx status is a Response, not an error — call Response.Err to treat it
// as one. An error means no attempt produced a response.
func (c *Client) Do(ctx context.Context, req Request) (*Response, error) {
	return attempt(ctx, req, c.doOnce, func(r *Response) (int, http.Header) {
		return r.Status, r.Header
	})
}

func (c *Client) doOnce(ctx context.Context, req Request) (*Response, error) {
	started := time.Now()

	if req.Timeout > 0 {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, req.Timeout)
		defer cancel()
	}

	ticket, err := c.admit(ctx, &req)
	if err != nil {
		return nil, err
	}

	httpResp, wire, err := c.send(ctx, req)
	if err != nil {
		c.settle(ctx, ticket, nil, err)
		c.report(req, 0, "", 0, started, err)
		return nil, err
	}
	defer httpResp.Body.Close()

	body, readErr := c.readBody(httpResp)
	if readErr != nil {
		c.settle(ctx, ticket, nil, readErr)
		c.report(req, httpResp.StatusCode, httpResp.Proto, wire.Load(), started, readErr)
		return nil, readErr
	}

	now := time.Now()
	resp := &Response{
		Status:      httpResp.StatusCode,
		Proto:       httpResp.Proto,
		Header:      httpResp.Header,
		Body:        body,
		Wire:        wire.Load(),
		Duration:    now.Sub(started),
		NotModified: httpResp.StatusCode == http.StatusNotModified,
		Validators:  readValidators(httpResp.Header),
		Cache:       readCacheInfo(httpResp.Header, now),
	}
	c.settle(ctx, ticket, resp, nil)
	c.report(req, resp.Status, resp.Proto, resp.Wire, started, nil)
	return resp, nil
}

// Stream sends the request and hands back a decompressed reader the caller
// closes. Stream.Wire reports the compressed total as it is read.
//
// Retry covers getting the headers only: once bytes have been read a second
// attempt is a different operation. The caller's context must outlive the body.
func (c *Client) Stream(ctx context.Context, req Request) (*Stream, error) {
	return attempt(ctx, req, c.streamOnce, func(s *Stream) (int, http.Header) {
		return s.Status, s.Header
	})
}

func (c *Client) streamOnce(ctx context.Context, req Request) (*Stream, error) {
	started := time.Now()

	ticket, err := c.admit(ctx, &req)
	if err != nil {
		return nil, err
	}

	httpResp, wire, err := c.send(ctx, req)
	if err != nil {
		c.settle(ctx, ticket, nil, err)
		c.report(req, 0, "", 0, started, err)
		return nil, err
	}

	body, err := decompress(httpResp)
	if err != nil {
		httpResp.Body.Close()
		c.settle(ctx, ticket, nil, err)
		c.report(req, httpResp.StatusCode, httpResp.Proto, wire.Load(), started, err)
		return nil, err
	}

	now := time.Now()
	stream := &Stream{
		Status:      httpResp.StatusCode,
		Proto:       httpResp.Proto,
		Header:      httpResp.Header,
		Body:        body,
		Duration:    now.Sub(started),
		NotModified: httpResp.StatusCode == http.StatusNotModified,
		Validators:  readValidators(httpResp.Header),
		Cache:       readCacheInfo(httpResp.Header, now),
		wire:        wire,
	}
	// Settled on headers: the cost is fixed by the status, and the caller may
	// hold the body open for a long time.
	c.settle(ctx, ticket, &Response{
		Status:     stream.Status,
		Proto:      stream.Proto,
		Header:     stream.Header,
		Validators: stream.Validators,
		Cache:      stream.Cache,
	}, nil)
	c.report(req, stream.Status, stream.Proto, wire.Load(), started, nil)
	return stream, nil
}

func (c *Client) report(req Request, status int, proto string, wire int64, started time.Time, err error) {
	if c.onComplete == nil {
		return
	}
	c.onComplete(Attempt{
		Method:   cmp.Or(req.Method, http.MethodGet),
		URL:      req.Path,
		Status:   status,
		Proto:    proto,
		Wire:     wire,
		Duration: time.Since(started),
		Err:      err,
	})
}

// attempt runs one call and repeats it while req.Retry warrants it. Shared by
// Do and Stream so the two cannot drift.
func attempt[T any](
	ctx context.Context,
	req Request,
	once func(context.Context, Request) (T, error),
	outcome func(T) (int, http.Header),
) (T, error) {
	policy := req.Retry
	attempts := 1
	if policy.allows(req.Method) {
		attempts = policy.Attempts
	}

	for n := 1; ; n++ {
		result, err := once(ctx, req)

		var header http.Header
		var repeat bool
		switch {
		case err != nil:
			repeat = policy.repeatError(err)
		default:
			var status int
			status, header = outcome(result)
			repeat = policy.repeatStatus(status)
		}

		if !repeat || n >= attempts {
			return result, err
		}

		// Superseded by the next attempt; do not hold the connection open.
		if discarded, ok := any(result).(*Stream); ok && discarded != nil {
			discarded.Body.Close()
		}

		if !policy.sleep(ctx, policy.wait(n, header)) {
			return result, err
		}
	}
}

// Err mirrors Response.Err for a streamed response. The body is unread at this
// point, so there is no snippet to report.
func (s *Stream) Err() error {
	if s.Status >= 200 && s.Status < 300 || s.Status == http.StatusNotModified {
		return nil
	}
	return &StatusError{Status: s.Status, Header: s.Header}
}

func (c *Client) send(ctx context.Context, req Request) (*http.Response, *atomic.Int64, error) {
	target, err := c.resolve(req)
	if err != nil {
		return nil, nil, err
	}

	method := req.Method
	if method == "" {
		method = http.MethodGet
	}

	payload := req.Body
	if len(payload) == 0 && len(req.Form) > 0 {
		payload = []byte(req.Form.Encode())
	}

	var body io.Reader
	if len(payload) > 0 {
		body = bytes.NewReader(payload)
	}

	httpReq, err := http.NewRequestWithContext(ctx, method, target, body)
	if err != nil {
		return nil, nil, err
	}
	if req.Host != "" {
		httpReq.Host = req.Host
	}
	c.applyHeaders(httpReq, req, len(payload) > 0)

	httpResp, err := c.http.Do(httpReq)
	if err != nil {
		return nil, nil, err
	}

	// Counted before decompression so the figure is what crossed the wire.
	wire := &atomic.Int64{}
	httpResp.Body = readCloser{
		Reader: countingReader{r: httpResp.Body, n: wire},
		Closer: httpResp.Body,
	}
	return httpResp, wire, nil
}

func (c *Client) resolve(req Request) (string, error) {
	raw := req.Path
	if !strings.Contains(raw, "://") {
		if c.baseURL == "" {
			return "", fmt.Errorf("relative path %q with no base URL", raw)
		}
		raw = c.baseURL + "/" + strings.TrimLeft(raw, "/")
	}

	parsed, err := url.Parse(raw)
	if err != nil {
		return "", err
	}
	if len(req.Query) > 0 {
		existing := parsed.Query()
		for key, values := range req.Query {
			for _, value := range values {
				existing.Add(key, value)
			}
		}
		parsed.RawQuery = existing.Encode()
	}
	return parsed.String(), nil
}

func (c *Client) applyHeaders(httpReq *http.Request, req Request, hasBody bool) {
	for key, values := range req.Header {
		for _, value := range values {
			httpReq.Header.Add(key, value)
		}
	}
	if httpReq.Header.Get("User-Agent") == "" {
		httpReq.Header.Set("User-Agent", c.userAgent)
	}
	if httpReq.Header.Get("Accept") == "" {
		httpReq.Header.Set("Accept", "application/json")
	}
	if hasBody && httpReq.Header.Get("Content-Type") == "" {
		contentType := "application/json"
		if len(req.Body) == 0 && len(req.Form) > 0 {
			contentType = "application/x-www-form-urlencoded"
		}
		httpReq.Header.Set("Content-Type", contentType)
	}
	// Requested explicitly so decompression happens here, which is what keeps
	// the pre-decompression byte count available.
	if httpReq.Header.Get("Accept-Encoding") == "" {
		httpReq.Header.Set("Accept-Encoding", "gzip")
	}
	if req.IfNoneMatch != "" {
		httpReq.Header.Set("If-None-Match", req.IfNoneMatch)
	}
	if !req.IfModifiedSince.IsZero() {
		httpReq.Header.Set("If-Modified-Since", req.IfModifiedSince.UTC().Format(http.TimeFormat))
	}
}

func (c *Client) readBody(httpResp *http.Response) ([]byte, error) {
	reader, err := decompress(httpResp)
	if err != nil {
		return nil, err
	}
	defer reader.Close()

	limited := io.LimitReader(reader, c.maxBodyBytes+1)
	body, err := io.ReadAll(limited)
	if err != nil {
		return nil, err
	}
	if int64(len(body)) > c.maxBodyBytes {
		return nil, &BodyTooLargeError{Limit: c.maxBodyBytes}
	}
	return body, nil
}

// decompress returns a reader over the response body, unwrapping gzip when the
// origin used it. Closing the result closes the response body too.
func decompress(httpResp *http.Response) (io.ReadCloser, error) {
	if httpResp.Uncompressed || !strings.EqualFold(httpResp.Header.Get("Content-Encoding"), "gzip") {
		return httpResp.Body, nil
	}

	gz, err := gzip.NewReader(httpResp.Body)
	if err != nil {
		// An empty body is not a gzip stream; 304 and 204 legitimately have none.
		if errors.Is(err, io.EOF) {
			return httpResp.Body, nil
		}
		return nil, fmt.Errorf("gzip reader: %w", err)
	}
	return multiCloser{Reader: gz, closers: []io.Closer{gz, httpResp.Body}}, nil
}

type readCloser struct {
	io.Reader
	io.Closer
}
