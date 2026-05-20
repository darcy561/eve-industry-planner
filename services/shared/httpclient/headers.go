package httpclient

import (
	"net/http"
	"os"
	"strings"
)

func appVersion() string {
	if v := strings.TrimSpace(os.Getenv("APP_VERSION_NUMBER")); v != "" {
		return v
	}
	if v := strings.TrimSpace(os.Getenv("APP_VERSION")); v != "" {
		return v
	}
	return "development"
}

// DefaultHeaders returns a map of default headers that should be applied to all HTTP requests.
func DefaultHeaders() map[string]string {
	return map[string]string{
		"User-Agent": `Eve Industry Planner Public/V` + appVersion() + ` (eve:Reginal Shardani; discordID:darcy561; discordURL:+https://discord.gg/KGSa8gh37z; Github:+https://github.com/darcy561/Eve-Industry-Planner-React)`,
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
