package httpclient

import (
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
	return otelhttp.NewTransport(&http.Transport{
		Proxy:                 http.ProxyFromEnvironment,
		MaxIdleConns:          100,
		MaxIdleConnsPerHost:   10,
		IdleConnTimeout:       90 * time.Second,
		TLSHandshakeTimeout:   10 * time.Second,
		ResponseHeaderTimeout: 30 * time.Second,
		ExpectContinueTimeout: 1 * time.Second,
		ForceAttemptHTTP2:     true,
		DisableCompression:    true,
	})
}
