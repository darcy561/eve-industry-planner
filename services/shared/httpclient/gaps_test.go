package httpclient

import (
	"bytes"
	"compress/gzip"
	"context"
	"errors"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestStreamErr(t *testing.T) {
	cases := []struct {
		status  int
		wantErr bool
	}{
		{status: http.StatusOK},
		{status: http.StatusNotModified},
		{status: http.StatusInternalServerError, wantErr: true},
	}

	for _, tc := range cases {
		t.Run(http.StatusText(tc.status), func(t *testing.T) {
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				w.WriteHeader(tc.status)
			}))
			defer srv.Close()

			stream, err := newTestClient(t, srv, Config{}).Stream(t.Context(), Request{Path: "/x"})
			if err != nil {
				t.Fatalf("Stream: %v", err)
			}
			defer stream.Body.Close()

			if gotErr := stream.Err() != nil; gotErr != tc.wantErr {
				t.Errorf("Err() != nil = %v, want %v", gotErr, tc.wantErr)
			}
		})
	}
}

func TestErrorMessages(t *testing.T) {
	withBody := &StatusError{Status: http.StatusNotFound, Snippet: `{"error":"gone"}`}
	if got := withBody.Error(); !strings.Contains(got, "404") || !strings.Contains(got, "gone") {
		t.Errorf("StatusError = %q, want the status and the snippet", got)
	}

	bare := &StatusError{Status: http.StatusBadGateway}
	if got := bare.Error(); !strings.Contains(got, "502") || strings.HasSuffix(got, ": ") {
		t.Errorf("StatusError without a body = %q", got)
	}

	tooLarge := &BodyTooLargeError{Limit: 4096}
	if got := tooLarge.Error(); !strings.Contains(got, "4096") {
		t.Errorf("BodyTooLargeError = %q", got)
	}

	inner := errors.New("gate says no")
	wrapped := &gateError{err: inner}
	if wrapped.Error() != inner.Error() {
		t.Errorf("gateError = %q, want the inner message", wrapped.Error())
	}
	if !errors.Is(wrapped, inner) {
		t.Error("gateError must unwrap to the gate's own error")
	}
}

func TestDefaultRetryIsUsable(t *testing.T) {
	r := DefaultRetry()
	switch {
	case r.Attempts < 2:
		t.Errorf("Attempts = %d, want more than one try", r.Attempts)
	case r.BaseDelay <= 0 || r.MaxDelay < r.BaseDelay:
		t.Errorf("delays = %v..%v", r.BaseDelay, r.MaxDelay)
	case r.Jitter <= 0:
		t.Errorf("Jitter = %v, want replicas desynchronised", r.Jitter)
	case !r.allows(http.MethodGet):
		t.Error("a GET should be retryable by default")
	case r.allows(http.MethodPost):
		t.Error("a POST should not be retryable by default")
	}
}

func TestCustomRepeatError(t *testing.T) {
	sentinel := errors.New("worth another go")
	policy := fastRetry(3)
	policy.RepeatError = func(err error) bool { return errors.Is(err, sentinel) }

	if !policy.repeatError(sentinel) {
		t.Error("a custom RepeatError should decide")
	}
	if policy.repeatError(errors.New("something else")) {
		t.Error("a custom RepeatError should also be able to decline")
	}
	if policy.repeatError(&gateError{err: sentinel}) {
		t.Error("a gate refusal outranks a custom RepeatError")
	}
}

func TestReadValidatorsParsesLastModified(t *testing.T) {
	when := time.Now().UTC().Truncate(time.Second)
	header := http.Header{}
	header.Set("ETag", `"abc"`)
	header.Set("Last-Modified", when.Format(http.TimeFormat))

	v := readValidators(header)
	if v.ETag != `"abc"` {
		t.Errorf("ETag = %q", v.ETag)
	}
	if !v.LastModified.Equal(when) {
		t.Errorf("LastModified = %v, want %v", v.LastModified, when)
	}

	header.Set("Last-Modified", "not a date")
	if got := readValidators(header); !got.LastModified.IsZero() {
		t.Errorf("an unparseable date should leave LastModified zero, got %v", got.LastModified)
	}
}

func TestEmptyGzipBodyIsNotAnError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Encoding", "gzip")
		w.WriteHeader(http.StatusNoContent)
	}))
	defer srv.Close()

	resp, err := newTestClient(t, srv, Config{}).Do(t.Context(), Request{Path: "/x"})
	if err != nil {
		t.Fatalf("a 204 declaring gzip with no body should not fail: %v", err)
	}
	if len(resp.Body) != 0 {
		t.Errorf("body = %q, want empty", resp.Body)
	}
}

func TestCorruptGzipIsReported(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Encoding", "gzip")
		_, _ = w.Write([]byte("this is not gzip at all"))
	}))
	defer srv.Close()

	_, err := newTestClient(t, srv, Config{}).Do(t.Context(), Request{Path: "/x"})
	if err == nil || !strings.Contains(err.Error(), "gzip") {
		t.Fatalf("err = %v, want a gzip failure", err)
	}
}

func TestTransparentlyDecompressedBodyIsNotUnwrappedTwice(t *testing.T) {
	var buf bytes.Buffer
	zw := gzip.NewWriter(&buf)
	_, _ = zw.Write([]byte(`{"ok":true}`))
	_ = zw.Close()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Encoding", "gzip")
		_, _ = w.Write(buf.Bytes())
	}))
	defer srv.Close()

	// A transport that decompresses for us sets Uncompressed, which the client
	// must notice rather than reaching for a second gzip reader.
	client := New(Config{BaseURL: srv.URL, Transport: &http.Transport{}})
	resp, err := client.Do(t.Context(), Request{
		Path:   "/x",
		Header: http.Header{"Accept-Encoding": {""}},
	})
	if err != nil {
		t.Fatalf("Do: %v", err)
	}
	if string(resp.Body) != `{"ok":true}` {
		t.Errorf("body = %q", resp.Body)
	}
}

func TestZeroWireOnUnstartedStream(t *testing.T) {
	if got := (&Stream{}).Wire(); got != 0 {
		t.Errorf("Wire() = %d on a zero Stream, want 0", got)
	}
}

func TestNewUnixTransport(t *testing.T) {
	socket := filepath.Join(t.TempDir(), "probe.sock")
	listener, err := net.Listen("unix", socket)
	if err != nil {
		t.Skipf("unix sockets unavailable: %v", err)
	}

	srv := &httptest.Server{
		Listener: listener,
		Config: &http.Server{Handler: http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			_, _ = w.Write([]byte(`{"ok":true}`))
		})},
	}
	srv.Start()
	defer srv.Close()

	client := New(Config{BaseURL: "http://socket.invalid", Transport: NewUnixTransport(socket)})
	resp, err := client.Do(t.Context(), Request{Path: "/ping"})
	if err != nil {
		t.Fatalf("Do over a unix socket: %v", err)
	}
	if string(resp.Body) != `{"ok":true}` {
		t.Errorf("body = %q", resp.Body)
	}
	if _, statErr := os.Stat(socket); statErr != nil {
		t.Errorf("socket missing: %v", statErr)
	}
}

func TestContextCancellationIsNotRetried(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		<-r.Context().Done()
	}))
	defer srv.Close()

	ctx, cancel := context.WithCancel(t.Context())
	go func() {
		time.Sleep(20 * time.Millisecond)
		cancel()
	}()

	_, err := newTestClient(t, srv, Config{}).Do(ctx, Request{Path: "/x", Retry: fastRetry(4)})
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("err = %v, want context.Canceled", err)
	}
}

// A gate refusing with a net-shaped error must still not be retried: the gate
// owns the timing, and its refusal is not a transport hiccup.
type netRefusingGate struct{ admits atomic.Int32 }

func (g *netRefusingGate) Admit(context.Context, *Request) (Ticket, error) {
	g.admits.Add(1)
	return nil, &net.OpError{Op: "dial", Err: errors.New("limiter says wait")}
}
func (g *netRefusingGate) Settle(context.Context, Ticket, *Response, error) {}

func TestNetShapedGateRefusalIsStillNotRetried(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))
	defer srv.Close()

	gate := &netRefusingGate{}
	client := newTestClient(t, srv, Config{Gate: gate})

	if _, err := client.Do(t.Context(), Request{Path: "/x", Retry: fastRetry(4)}); err == nil {
		t.Fatal("expected the refusal")
	}
	if got := gate.admits.Load(); got != 1 {
		t.Fatalf("admits = %d, want 1 — a gate refusal is never retried whatever it looks like", got)
	}
}
