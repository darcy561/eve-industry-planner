package httpclient

import (
	"bytes"
	"compress/gzip"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// tlsServer starts an in-process origin over real TLS with HTTP/2 negotiated,
// which is what a production origin looks like and what plaintext httptest
// servers never exercise.
func tlsServer(t *testing.T, h http.HandlerFunc) *httptest.Server {
	t.Helper()
	srv := httptest.NewUnstartedServer(h)
	srv.EnableHTTP2 = true
	srv.StartTLS()
	t.Cleanup(srv.Close)
	return srv
}

func TestOverTLSAndHTTP2(t *testing.T) {
	payload := strings.Repeat(`{"order_id":123456789}`, 400)
	var compressed bytes.Buffer
	zw := gzip.NewWriter(&compressed)
	_, _ = zw.Write([]byte(payload))
	_ = zw.Close()

	var proto string
	srv := tlsServer(t, func(w http.ResponseWriter, r *http.Request) {
		proto = r.Proto
		w.Header().Set("Content-Encoding", "gzip")
		w.Header().Set("ETag", `"v2"`)
		w.Header().Set("Cache-Control", "max-age=300")
		_, _ = w.Write(compressed.Bytes())
	})

	client := New(Config{BaseURL: srv.URL, Transport: srv.Client().Transport})
	resp, err := client.Do(t.Context(), Request{Path: "/x"})
	if err != nil {
		t.Fatalf("Do over TLS: %v", err)
	}

	if proto != "HTTP/2.0" {
		t.Errorf("negotiated %s, want HTTP/2.0 — h2 framing is what production uses", proto)
	}
	if resp.Proto != "HTTP/2.0" {
		t.Errorf("Response.Proto = %q, want the negotiated protocol reported back", resp.Proto)
	}
	if string(resp.Body) != payload {
		t.Errorf("body not decompressed over h2: %d bytes", len(resp.Body))
	}
	if resp.Wire != int64(compressed.Len()) {
		t.Errorf("Wire = %d, want %d — byte counting must survive h2 framing", resp.Wire, compressed.Len())
	}
	if resp.Validators.ETag != `"v2"` || resp.Cache.MaxAge == 0 {
		t.Errorf("header parsing lost over h2: %+v %+v", resp.Validators, resp.Cache)
	}
}

func TestStreamOverTLSAndHTTP2(t *testing.T) {
	srv := tlsServer(t, func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`[{"id":1},{"id":2},{"id":3}]`))
	})

	client := New(Config{BaseURL: srv.URL, Transport: srv.Client().Transport})
	stream, err := client.Stream(t.Context(), Request{Path: "/x"})
	if err != nil {
		t.Fatalf("Stream over TLS: %v", err)
	}
	defer stream.Body.Close()

	type row struct {
		ID int `json:"id"`
	}
	seen := 0
	if err := StreamJSON(stream.Body, func(row) error { seen++; return nil }); err != nil {
		t.Fatalf("StreamJSON: %v", err)
	}
	if seen != 3 {
		t.Errorf("walked %d rows, want 3", seen)
	}
	if stream.Proto != "HTTP/2.0" {
		t.Errorf("Stream.Proto = %q", stream.Proto)
	}
}

func TestPlaintextReportsHTTP11(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{}`))
	}))
	defer srv.Close()

	resp, err := newTestClient(t, srv, Config{}).Do(t.Context(), Request{Path: "/x"})
	if err != nil {
		t.Fatalf("Do: %v", err)
	}
	if resp.Proto != "HTTP/1.1" {
		t.Errorf("Proto = %q — cleartext has no h2c in net/http, so this must report 1.1", resp.Proto)
	}
}

func TestH2ConfigIsApplied(t *testing.T) {
	transport := baseTransport()
	switch {
	case !transport.ForceAttemptHTTP2:
		t.Error("ForceAttemptHTTP2 off: a custom dialler would silently downgrade to HTTP/1.1")
	case transport.HTTP2 == nil:
		t.Fatal("HTTP2 config absent — h2 would run on library defaults")
	case transport.HTTP2.SendPingTimeout == 0:
		t.Error("no ping health check: a dead multiplexed connection stalls every request on it")
	case transport.HTTP2.MaxReceiveBufferPerStream == 0:
		t.Error("default flow-control window can make large bodies slower over h2 than HTTP/1.1")
	}
}

func TestRedirectsAreFollowedAndReported(t *testing.T) {
	var hops int
	srv := tlsServer(t, func(w http.ResponseWriter, r *http.Request) {
		hops++
		if r.URL.Path == "/moved" {
			http.Redirect(w, r, "/final", http.StatusMovedPermanently)
			return
		}
		_, _ = w.Write([]byte(`{"ok":true}`))
	})

	client := New(Config{BaseURL: srv.URL, Transport: srv.Client().Transport})
	resp, err := client.Do(t.Context(), Request{Path: "/moved"})
	if err != nil {
		t.Fatalf("Do: %v", err)
	}
	if resp.Status != http.StatusOK {
		t.Errorf("Status = %d, want the followed 200", resp.Status)
	}
	if hops != 2 {
		t.Errorf("hops = %d, want 2 — the redirect is followed by the transport", hops)
	}
}
