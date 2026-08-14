// Package container resolves the Docker short container id for this process.
//
// SoT: in-container HOSTNAME (Docker default = ContainerID[:12]). Used for
// OTel service.instance.id, JetStream durable suffixes, placement keys, leases,
// and probes. Do not read OTEL_SERVICE_INSTANCE_ID — that env is not identity SoT.
//
// Depends on ContainerSpec.Hostname / --hostname not being overridden; if it is,
// revisit this package.
package container

import (
	"os"
	"regexp"
	"strings"
)

var idSanitizer = regexp.MustCompile(`[^a-zA-Z0-9_-]+`)

// ID returns the sanitized short container id for this process.
//
// Priority: HOSTNAME env → os.Hostname() → "local". Max 64 chars.
func ID() string {
	raw := strings.TrimSpace(os.Getenv("HOSTNAME"))
	if raw == "" {
		if h, err := os.Hostname(); err == nil {
			raw = strings.TrimSpace(h)
		}
	}
	if raw == "" {
		raw = "local"
	}
	s := idSanitizer.ReplaceAllString(raw, "_")
	s = strings.Trim(s, "_")
	if s == "" {
		s = "local"
	}
	if len(s) > 64 {
		s = s[:64]
	}
	return s
}
