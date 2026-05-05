package helper

import (
	"net/http"
	"strings"
)

const (
	// WSClientIDHeader is the request header carrying the websocket client ID.
	WSClientIDHeader = "X-WS-Client-ID"
	// SessionIDHeader carries the JWT session_id claim; private HTTP routes require it to match the JWT (middleware).
	// WebSocket upgrades use query param session_id when the header is absent (browser limitation).
	SessionIDHeader = "X-Session-ID"
)

// ExtractWSClientID returns the trimmed websocket client ID header value.
// Returns empty string when absent.
func ExtractWSClientID(r *http.Request) string {
	if r == nil {
		return ""
	}
	return strings.TrimSpace(r.Header.Get(WSClientIDHeader))
}

// ExtractSessionIDHeader returns the trimmed session id header value (optional telemetry/debug use).
func ExtractSessionIDHeader(r *http.Request) string {
	if r == nil {
		return ""
	}
	return strings.TrimSpace(r.Header.Get(SessionIDHeader))
}
