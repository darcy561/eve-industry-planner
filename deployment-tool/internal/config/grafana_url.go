package config

import (
	"fmt"
	"net/url"
	"strings"
)

// DefaultGrafanaBaseURL is the starter / fallback origin when base_url is omitted.
const DefaultGrafanaBaseURL = "http://127.0.0.1"

// GrafanaRootURL builds GRAFANA_ROOT_URL from DefaultGrafanaBaseURL + path.
func GrafanaRootURL(pathPrefix string) string {
	return joinGrafanaRootURL(DefaultGrafanaBaseURL, pathPrefix)
}

// EffectiveGrafanaRootURL combines base_url (or DefaultGrafanaBaseURL) with paths.grafana.
func (c Config) EffectiveGrafanaRootURL() string {
	base := strings.TrimSpace(c.Addons.Observability.Grafana.BaseURL)
	if base == "" {
		base = DefaultGrafanaBaseURL
	}
	return joinGrafanaRootURL(base, c.EffectivePaths().Grafana)
}

func joinGrafanaRootURL(base, pathPrefix string) string {
	base = strings.TrimRight(strings.TrimSpace(base), "/")
	pathPrefix = normalizeGrafanaPath(pathPrefix)
	if pathPrefix == "" {
		pathPrefix = "/grafana"
	}
	return base + pathPrefix + "/"
}

func normalizeGrafanaPath(p string) string {
	p = strings.TrimSpace(p)
	if p == "" || p == "/" {
		return p
	}
	return strings.TrimSuffix(p, "/")
}

// validateGrafanaBaseURL checks optional base_url: http(s) + host, no path (path comes from paths.grafana).
func validateGrafanaBaseURL(baseURL string) error {
	baseURL = strings.TrimSpace(baseURL)
	if baseURL == "" {
		return nil
	}
	u, err := url.ParseRequestURI(baseURL)
	if err != nil {
		return fmt.Errorf("addons.observability.grafana.base_url: %w", err)
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return fmt.Errorf("addons.observability.grafana.base_url: want http or https scheme, got %q", u.Scheme)
	}
	if u.Host == "" {
		return fmt.Errorf("addons.observability.grafana.base_url: missing host")
	}
	path := normalizeGrafanaPath(u.Path)
	if path != "" && path != "/" {
		return fmt.Errorf("addons.observability.grafana.base_url: set host only (no path); Path is configured separately (got %q)", u.Path)
	}
	return nil
}
