package telemetry

import (
	"net/url"
	"strings"
)

// normalizeOTLPEndpoint returns host:port for OTLP gRPC exporters.
func normalizeOTLPEndpoint(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", errEmptyEndpoint
	}
	if strings.Contains(raw, "://") {
		u, err := url.Parse(raw)
		if err != nil {
			return "", err
		}
		if u.Host == "" {
			return "", errNoHost
		}
		return u.Host, nil
	}
	return raw, nil
}
