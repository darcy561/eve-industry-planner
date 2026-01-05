package httpclient

import "net/http"

const APP_VERSION = "1.0"

// DefaultHeaders returns a map of default headers that should be applied to all HTTP requests.
func DefaultHeaders() map[string]string {
	return map[string]string{
		"User-Agent": `Eve Industry Planner Standalone/V` + APP_VERSION + ` (eve:Oswold Saraki/Reginal Shardani; discordID:darcy561; discordURL:+https://discord.gg/KGSa8gh37z; Github:+https://github.com/darcy561/Eve-Industry-Planner-React)`,
	}
}

// ApplyDefaultHeaders applies the default headers to the given HTTP request.
// If a header already exists, it will not be overwritten.
func ApplyDefaultHeaders(req *http.Request) {
	headers := DefaultHeaders()
	for key, value := range headers {
		if req.Header.Get(key) == "" {
			req.Header.Set(key, value)
		}
	}
}
