package httpclient

import (
	"bytes"
	"compress/gzip"
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"
)

func newTestClient(t *testing.T, srv *httptest.Server, cfg Config) *Client {
	t.Helper()
	cfg.BaseURL = srv.URL
	cfg.Transport = srv.Client().Transport
	return New(cfg)
}

func gzipBytes(t *testing.T, payload string) []byte {
	t.Helper()
	var buf bytes.Buffer
	zw := gzip.NewWriter(&buf)
	if _, err := zw.Write([]byte(payload)); err != nil {
		t.Fatalf("gzip write: %v", err)
	}
	if err := zw.Close(); err != nil {
		t.Fatalf("gzip close: %v", err)
	}
	return buf.Bytes()
}

func TestDoDecompressesAndCountsWireBytes(t *testing.T) {
	payload := strings.Repeat(`{"id":1234567890}`, 500)
	compressed := gzipBytes(t, payload)

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get("Accept-Encoding"); got != "gzip" {
			t.Errorf("Accept-Encoding = %q, want gzip", got)
		}
		w.Header().Set("Content-Encoding", "gzip")
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(compressed)
	}))
	defer srv.Close()

	resp, err := newTestClient(t, srv, Config{}).Do(t.Context(), Request{Path: "/x"})
	if err != nil {
		t.Fatalf("Do: %v", err)
	}
	if string(resp.Body) != payload {
		t.Fatalf("body not decompressed: got %d bytes, want %d", len(resp.Body), len(payload))
	}
	if resp.Wire != int64(len(compressed)) {
		t.Errorf("Wire = %d, want %d (compressed size)", resp.Wire, len(compressed))
	}
	if resp.Wire >= int64(len(payload)) {
		t.Errorf("Wire = %d should be below the decompressed size %d", resp.Wire, len(payload))
	}
}

func TestDoHandlesUncompressedBody(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	defer srv.Close()

	resp, err := newTestClient(t, srv, Config{}).Do(t.Context(), Request{Path: "/x"})
	if err != nil {
		t.Fatalf("Do: %v", err)
	}
	if string(resp.Body) != `{"ok":true}` {
		t.Errorf("body = %q", resp.Body)
	}
	if resp.Wire != int64(len(`{"ok":true}`)) {
		t.Errorf("Wire = %d, want %d", resp.Wire, len(`{"ok":true}`))
	}
}

func TestConditionalRequestAndNotModified(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("If-None-Match") != `"v1"` {
			t.Errorf("If-None-Match = %q", r.Header.Get("If-None-Match"))
		}
		if r.Header.Get("If-Modified-Since") == "" {
			t.Error("If-Modified-Since not sent")
		}
		w.Header().Set("ETag", `"v1"`)
		w.WriteHeader(http.StatusNotModified)
	}))
	defer srv.Close()

	resp, err := newTestClient(t, srv, Config{}).Do(t.Context(), Request{
		Path:            "/x",
		IfNoneMatch:     `"v1"`,
		IfModifiedSince: time.Unix(1_700_000_000, 0),
	})
	if err != nil {
		t.Fatalf("Do: %v", err)
	}
	if !resp.NotModified {
		t.Errorf("NotModified = false, status %d", resp.Status)
	}
	if resp.Validators.ETag != `"v1"` {
		t.Errorf("ETag = %q", resp.Validators.ETag)
	}
	if err := resp.Err(); err != nil {
		t.Errorf("304 should not be an error, got %v", err)
	}
}

func TestStatusIsDataUntilErrIsCalled(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusTooManyRequests)
		_, _ = w.Write([]byte(`{"error":"slow down"}`))
	}))
	defer srv.Close()

	resp, err := newTestClient(t, srv, Config{}).Do(t.Context(), Request{Path: "/x"})
	if err != nil {
		t.Fatalf("Do returned an error for a 429; status should be data: %v", err)
	}
	if resp.Status != http.StatusTooManyRequests {
		t.Fatalf("Status = %d", resp.Status)
	}

	statusErr, ok := errors.AsType[*StatusError](resp.Err())
	if !ok {
		t.Fatalf("Err() = %v, want *StatusError", resp.Err())
	}
	if statusErr.Status != http.StatusTooManyRequests {
		t.Errorf("StatusError.Status = %d", statusErr.Status)
	}
	if !strings.Contains(statusErr.Snippet, "slow down") {
		t.Errorf("Snippet = %q", statusErr.Snippet)
	}
}

func TestCacheInfoFromHeaders(t *testing.T) {
	cases := []struct {
		name   string
		set    func(http.Header)
		maxAge time.Duration
	}{
		{
			name:   "cache-control max-age",
			set:    func(h http.Header) { h.Set("Cache-Control", "public, max-age=300") },
			maxAge: 300 * time.Second,
		},
		{
			name: "expires when no max-age",
			set: func(h http.Header) {
				h.Set("Expires", time.Now().Add(2*time.Minute).UTC().Format(http.TimeFormat))
			},
			maxAge: time.Minute, // at least; Expires has second resolution
		},
		{
			name:   "neither",
			set:    func(http.Header) {},
			maxAge: 0,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				tc.set(w.Header())
				_, _ = w.Write([]byte(`{}`))
			}))
			defer srv.Close()

			resp, err := newTestClient(t, srv, Config{}).Do(t.Context(), Request{Path: "/x"})
			if err != nil {
				t.Fatalf("Do: %v", err)
			}
			if tc.maxAge == 0 && resp.Cache.MaxAge != 0 {
				t.Errorf("MaxAge = %v, want 0", resp.Cache.MaxAge)
			}
			if tc.maxAge > 0 && resp.Cache.MaxAge < tc.maxAge {
				t.Errorf("MaxAge = %v, want at least %v", resp.Cache.MaxAge, tc.maxAge)
			}
		})
	}
}

func TestStreamDecompressesAndCountsAfterRead(t *testing.T) {
	payload := strings.Repeat("row\n", 2000)
	compressed := gzipBytes(t, payload)

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Encoding", "gzip")
		_, _ = w.Write(compressed)
	}))
	defer srv.Close()

	stream, err := newTestClient(t, srv, Config{}).Stream(t.Context(), Request{Path: "/x"})
	if err != nil {
		t.Fatalf("Stream: %v", err)
	}
	defer stream.Body.Close()

	read, err := io.ReadAll(stream.Body)
	if err != nil {
		t.Fatalf("read stream: %v", err)
	}
	if string(read) != payload {
		t.Fatalf("stream not decompressed: got %d bytes, want %d", len(read), len(payload))
	}
	if stream.Wire() != int64(len(compressed)) {
		t.Errorf("Wire() = %d, want %d", stream.Wire(), len(compressed))
	}
}

func TestDoRejectsOversizedBody(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write(bytes.Repeat([]byte("a"), 4096))
	}))
	defer srv.Close()

	_, err := newTestClient(t, srv, Config{MaxBodyBytes: 1024}).Do(t.Context(), Request{Path: "/x"})
	tooLarge, ok := errors.AsType[*BodyTooLargeError](err)
	if !ok {
		t.Fatalf("err = %v, want *BodyTooLargeError", err)
	}
	if tooLarge.Limit != 1024 {
		t.Errorf("Limit = %d", tooLarge.Limit)
	}
}

func TestRequestBuilding(t *testing.T) {
	var got *http.Request
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got = r.Clone(r.Context())
		_, _ = w.Write([]byte(`{}`))
	}))
	defer srv.Close()

	client := newTestClient(t, srv, Config{UserAgent: "test-agent"})
	_, err := client.Do(t.Context(), Request{
		Method: http.MethodPost,
		Path:   "markets/orders",
		Query:  url.Values{"page": {"2"}, "order_type": {"all"}},
		Body:   []byte(`[1,2,3]`),
		Header: http.Header{"X-Compatibility-Date": {"2025-12-16"}},
	})
	if err != nil {
		t.Fatalf("Do: %v", err)
	}

	if got.Method != http.MethodPost {
		t.Errorf("Method = %s", got.Method)
	}
	if got.URL.Path != "/markets/orders" {
		t.Errorf("Path = %q, want /markets/orders", got.URL.Path)
	}
	if got.URL.Query().Get("page") != "2" || got.URL.Query().Get("order_type") != "all" {
		t.Errorf("Query = %q", got.URL.RawQuery)
	}
	if got.Header.Get("User-Agent") != "test-agent" {
		t.Errorf("User-Agent = %q", got.Header.Get("User-Agent"))
	}
	if got.Header.Get("Content-Type") != "application/json" {
		t.Errorf("Content-Type = %q", got.Header.Get("Content-Type"))
	}
	if got.Header.Get("X-Compatibility-Date") != "2025-12-16" {
		t.Errorf("caller header dropped: %q", got.Header.Get("X-Compatibility-Date"))
	}
}

func TestAbsolutePathIgnoresBaseURL(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{}`))
	}))
	defer srv.Close()

	client := New(Config{BaseURL: "https://example.invalid", Transport: srv.Client().Transport})
	if _, err := client.Do(t.Context(), Request{Path: srv.URL + "/absolute"}); err != nil {
		t.Fatalf("Do: %v", err)
	}
}

func TestRelativePathWithoutBaseURLFails(t *testing.T) {
	_, err := New(Config{}).Do(context.Background(), Request{Path: "/x"})
	if err == nil || !strings.Contains(err.Error(), "no base URL") {
		t.Fatalf("err = %v, want a no-base-URL error", err)
	}
}
