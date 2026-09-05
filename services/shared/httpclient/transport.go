package httpclient

import (
	"context"
	"net"
	"net/http"
	"time"

	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
)

// NewTransport returns the outbound transport shared by service HTTP clients,
// wrapped so client spans and W3C trace context follow the request.
//
// ResponseHeaderTimeout bounds the wait for response headers. Reading the body
// is bounded by the caller's context instead, so a long stream is not cut short
// by a client-wide deadline.
func NewTransport() http.RoundTripper {
	return otelhttp.NewTransport(baseTransport())
}

// NewUnixTransport is NewTransport over a unix socket, for a local daemon
// reached through a socket rather than a port. The request URL still needs a
// host; it is ignored when dialling.
func NewUnixTransport(socketPath string) http.RoundTripper {
	base := baseTransport()
	base.DialContext = func(ctx context.Context, _, _ string) (net.Conn, error) {
		var dialer net.Dialer
		return dialer.DialContext(ctx, "unix", socketPath)
	}
	return otelhttp.NewTransport(base)
}

func baseTransport() *http.Transport {
	return &http.Transport{
		Proxy:                 http.ProxyFromEnvironment,
		MaxIdleConns:          100,
		MaxIdleConnsPerHost:   10,
		IdleConnTimeout:       90 * time.Second,
		TLSHandshakeTimeout:   10 * time.Second,
		ResponseHeaderTimeout: 30 * time.Second,
		ExpectContinueTimeout: 1 * time.Second,
		DisableCompression:    true,

		// HTTP/2 is negotiated by ALPN on TLS, so whether a request gets it is
		// the origin's choice. ForceAttemptHTTP2 only stops net/http disabling
		// it when a transport sets DialContext or TLSClientConfig, which the
		// unix variant below does.
		ForceAttemptHTTP2: true,
		HTTP2: &http.HTTP2Config{
			// One h2 connection carries every concurrent request, so a dead one
			// stalls all of them. Ping an idle connection rather than finding
			// out when a request hangs.
			SendPingTimeout: 15 * time.Second,
			PingTimeout:     15 * time.Second,
			// Close a connection whose peer has stopped reading.
			WriteByteTimeout: 30 * time.Second,
			// The defaults are small enough that a large body can be slower over
			// h2 than over HTTP/1.1, because the window refills a chunk at a
			// time. Paged market data is exactly that shape.
			MaxReceiveBufferPerStream:     2 << 20,
			MaxReceiveBufferPerConnection: 3 << 20,
		},
	}
}
