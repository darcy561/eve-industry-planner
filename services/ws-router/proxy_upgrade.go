package main

import (
	"bufio"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/propagation"
)

// wsProxyCopyBuf is the per-direction io.Copy buffer for upgraded WebSockets.
// Go's httputil.ReverseProxy upgrade path uses 32KiB; 16KiB is enough for typical
// EIP JSON frames and roughly halves live copy-buffer RAM at high fan-in.
const wsProxyCopyBuf = 16 * 1024

const wsProxyDialTimeout = 10 * time.Second

// errProxyClientWritten means the client already received a response (101 or error body).
var errProxyClientWritten = errors.New("client response already written")

var wsProxyBufPool = sync.Pool{
	New: func() any {
		b := make([]byte, wsProxyCopyBuf)
		return &b
	},
}

func isWebSocketUpgrade(req *http.Request) bool {
	if req == nil {
		return false
	}
	if !strings.EqualFold(req.Header.Get("Upgrade"), "websocket") {
		return false
	}
	for v := range strings.SplitSeq(req.Header.Get("Connection"), ",") {
		if strings.EqualFold(strings.TrimSpace(v), "upgrade") {
			return true
		}
	}
	return false
}

// proxyWebSocketUpgrade dials the backend, completes the 101 handshake, then
// pumps both directions with pooled 16KiB buffers (not httputil's 32KiB copies).
func proxyWebSocketUpgrade(w http.ResponseWriter, req *http.Request, target *url.URL) error {
	if target == nil || target.Host == "" {
		return fmt.Errorf("empty backend target")
	}
	if !isWebSocketUpgrade(req) {
		return fmt.Errorf("not a websocket upgrade")
	}
	hj, ok := w.(http.Hijacker)
	if !ok {
		return fmt.Errorf("response does not support hijack")
	}

	backend, err := net.DialTimeout("tcp", target.Host, wsProxyDialTimeout)
	if err != nil {
		return fmt.Errorf("dial backend: %w", err)
	}
	backendOK := false
	defer func() {
		if !backendOK {
			_ = backend.Close()
		}
	}()

	outReq := req.Clone(req.Context())
	outReq.RequestURI = ""
	outReq.URL = &url.URL{
		Scheme:   "http",
		Host:     target.Host,
		Path:     req.URL.Path,
		RawPath:  req.URL.RawPath,
		RawQuery: req.URL.RawQuery,
	}
	if outReq.URL.Path == "" {
		outReq.URL.Path = "/"
	}
	outReq.Host = target.Host
	removeWSHopHeaders(outReq.Header)
	outReq.Header.Set("Connection", "Upgrade")
	outReq.Header.Set("Upgrade", "websocket")
	// The clone still carries the caller's inbound traceparent, which would make the backend a
	// sibling of this router rather than its child. Overwrite it with the routing span.
	otel.GetTextMapPropagator().Inject(outReq.Context(), propagation.HeaderCarrier(outReq.Header))

	if err := outReq.Write(backend); err != nil {
		return fmt.Errorf("write backend request: %w", err)
	}

	backendReader := bufio.NewReaderSize(backend, wsProxyCopyBuf)
	resp, err := http.ReadResponse(backendReader, outReq)
	if err != nil {
		return fmt.Errorf("read backend response: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusSwitchingProtocols {
		copyHeader(w.Header(), resp.Header)
		w.WriteHeader(resp.StatusCode)
		_, _ = io.Copy(w, resp.Body)
		return fmt.Errorf("%w: backend status %d", errProxyClientWritten, resp.StatusCode)
	}

	clientConn, clientBuf, err := hj.Hijack()
	if err != nil {
		return fmt.Errorf("hijack: %w", err)
	}
	backendOK = true

	mergeUpgradeHeaders(w.Header(), resp.Header)
	if err := writeSwitchingProtocols(clientConn, clientBuf, w.Header()); err != nil {
		_ = clientConn.Close()
		_ = backend.Close()
		return fmt.Errorf("%w: %v", errProxyClientWritten, err)
	}

	if n := backendReader.Buffered(); n > 0 {
		peek, _ := backendReader.Peek(n)
		if _, err := clientConn.Write(peek); err != nil {
			_ = clientConn.Close()
			_ = backend.Close()
			return fmt.Errorf("%w: %v", errProxyClientWritten, err)
		}
		_, _ = backendReader.Discard(n)
	}
	if clientBuf != nil {
		if err := clientBuf.Flush(); err != nil {
			_ = clientConn.Close()
			_ = backend.Close()
			return fmt.Errorf("%w: %v", errProxyClientWritten, err)
		}
	}

	errc := make(chan struct{}, 2)
	go func() { _ = copyWS(backend, clientConn); errc <- struct{}{} }()
	go func() { _ = copyWS(clientConn, backend); errc <- struct{}{} }()
	<-errc
	_ = clientConn.Close()
	_ = backend.Close()
	<-errc
	// Copy errors on close are normal; client already has 101.
	return nil
}

func copyWS(dst io.Writer, src io.Reader) error {
	bufPtr := wsProxyBufPool.Get().(*[]byte)
	defer wsProxyBufPool.Put(bufPtr)
	_, err := io.CopyBuffer(dst, src, *bufPtr)
	return err
}

func writeSwitchingProtocols(conn net.Conn, buf *bufio.ReadWriter, hdr http.Header) error {
	var w io.Writer = conn
	if buf != nil {
		w = buf.Writer
	}
	if _, err := io.WriteString(w, "HTTP/1.1 101 Switching Protocols\r\n"); err != nil {
		return err
	}
	if err := hdr.Write(w); err != nil {
		return err
	}
	if _, err := io.WriteString(w, "\r\n"); err != nil {
		return err
	}
	if buf != nil {
		return buf.Flush()
	}
	return nil
}

func removeWSHopHeaders(h http.Header) {
	for _, k := range []string{
		"Keep-Alive",
		"Proxy-Authenticate",
		"Proxy-Authorization",
		"Proxy-Connection",
		"Te",
		"Trailers",
		"Transfer-Encoding",
	} {
		h.Del(k)
	}
}

func copyHeader(dst, src http.Header) {
	for k, vv := range src {
		for _, v := range vv {
			dst.Add(k, v)
		}
	}
}

// mergeUpgradeHeaders keeps cookies already on dst (sticky) and overlays backend 101 fields.
func mergeUpgradeHeaders(dst, src http.Header) {
	for k, vv := range src {
		if strings.EqualFold(k, "Set-Cookie") {
			for _, v := range vv {
				dst.Add(k, v)
			}
			continue
		}
		for _, v := range vv {
			dst.Set(k, v)
		}
	}
}
