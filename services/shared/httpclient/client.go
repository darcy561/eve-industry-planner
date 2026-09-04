package httpclient

import (
	"bytes"
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
}

// Client issues outbound HTTP for a service. It owns transfer concerns —
// compression, byte accounting, conditional-request headers, validator and
// cache parsing — and no policy: it does not retry, rate limit, authenticate,
// or decide that a status code is a failure.
//
// It has no timeout of its own. Callers bound a request with their context, so
// a long stream is not cut short by a client-wide deadline; waiting for
// response headers is bounded by the transport.
type Client struct {
	http         *http.Client
	baseURL      string
	maxBodyBytes int64
	userAgent    string
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

	// IfNoneMatch and IfModifiedSince make the call conditional. A conditional
	// hit answers 304, which is cheaper on every axis that matters — bytes,
	// origin work, and rate-limit cost where the origin charges by response.
	IfNoneMatch     string
	IfModifiedSince time.Time
}

// Do sends the request and reads the whole body, decompressed.
//
// A non-2xx status is returned as a Response, not an error — call Response.Err
// to treat it as one. An error means the exchange did not complete.
func (c *Client) Do(ctx context.Context, req Request) (*Response, error) {
	started := time.Now()

	httpResp, wire, err := c.send(ctx, req)
	if err != nil {
		return nil, err
	}
	defer httpResp.Body.Close()

	body, err := c.readBody(httpResp)
	if err != nil {
		return nil, err
	}

	now := time.Now()
	return &Response{
		Status:      httpResp.StatusCode,
		Header:      httpResp.Header,
		Body:        body,
		Wire:        wire.Load(),
		Duration:    now.Sub(started),
		NotModified: httpResp.StatusCode == http.StatusNotModified,
		Validators:  readValidators(httpResp.Header),
		Cache:       readCacheInfo(httpResp.Header, now),
	}, nil
}

// Stream sends the request and hands back a decompressed reader the caller must
// close. Byte accounting continues while the body is read; Stream.Wire reports
// the compressed total.
//
// The caller's context governs the whole read, so it must outlive the body.
func (c *Client) Stream(ctx context.Context, req Request) (*Stream, error) {
	started := time.Now()

	httpResp, wire, err := c.send(ctx, req)
	if err != nil {
		return nil, err
	}

	body, err := decompress(httpResp)
	if err != nil {
		httpResp.Body.Close()
		return nil, err
	}

	now := time.Now()
	return &Stream{
		Status:      httpResp.StatusCode,
		Header:      httpResp.Header,
		Body:        body,
		Duration:    now.Sub(started),
		NotModified: httpResp.StatusCode == http.StatusNotModified,
		Validators:  readValidators(httpResp.Header),
		Cache:       readCacheInfo(httpResp.Header, now),
		wire:        wire,
	}, nil
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

	var body io.Reader
	if len(req.Body) > 0 {
		body = bytes.NewReader(req.Body)
	}

	httpReq, err := http.NewRequestWithContext(ctx, method, target, body)
	if err != nil {
		return nil, nil, err
	}
	c.applyHeaders(httpReq, req)

	httpResp, err := c.http.Do(httpReq)
	if err != nil {
		return nil, nil, err
	}

	// Count before decompression so the figure is what crossed the wire.
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

func (c *Client) applyHeaders(httpReq *http.Request, req Request) {
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
	if len(req.Body) > 0 && httpReq.Header.Get("Content-Type") == "" {
		httpReq.Header.Set("Content-Type", "application/json")
	}
	// Requested explicitly, and so decompressed here rather than by the
	// transport, which is what keeps the pre-decompression byte count available.
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
