package helper

import (
	"net/http"
	"strings"
)

const (
	// WSClientIDHeader is the request header carrying the websocket client ID.
	WSClientIDHeader = "X-WS-Client-ID"
	// SessionIDHeader carries the per-tab planner session id (primary auth identity).
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
