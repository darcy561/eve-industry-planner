// Package compression holds shared level constants for HTTP (brotli/gzip) and WebSocket
// (permessage-deflate / compress/flate) so they stay aligned.
package compression

// Brotli / gzip writer levels (api/middleware). selectResponseCompressionLevel uses
// ResponseDefaultLevel for bodies <= ResponseHighLevelBytes, else ResponseHighLevel.
const (
	ResponseDefaultLevel   = 4
	ResponseHighLevel      = 6
	ResponseHighLevelBytes = 50 * 1024
)

// FlateDefaultLevel is the compress/flate level for WebSocket outbound data frames when
// permessage-deflate is negotiated. It uses the same numeric level as ResponseDefaultLevel
// (flate levels 1–9; 4 matches the API’s default brotli/gzip tier in this codebase).
const FlateDefaultLevel = ResponseDefaultLevel
