// Package instanceid resolves a stable per-process replica identifier used for OpenTelemetry
// service.instance.id, websocket JetStream durable suffixes, ws_instance_id metric labels, etc.
//
// Contract (Swarm migration #2): prefer OTEL_SERVICE_INSTANCE_ID set to a slot-stable name —
// api-{{.Task.Slot}}, websocket-{{.Task.Slot}}, worker-{{.Task.Slot}}, or fixed "core".
// See docs/swarm/IDENTITY.md.
package instanceid

import (
	"os"
	"regexp"
	"strings"
)

var replicaSanitizer = regexp.MustCompile(`[^a-zA-Z0-9_-]+`)

// Replica returns a sanitized stable id for this process.
//
// Priority: OTEL_SERVICE_INSTANCE_ID → WS_CONSUMER_NAME → DOCKER_CONTAINER_NAME → CONTAINER_NAME →
// HOSTNAME → os.Hostname() → "local".
//
// Set OTEL_SERVICE_INSTANCE_ID (preferred) or DOCKER_CONTAINER_NAME when you want dashboards and
// Prometheus labels to match a human-readable / slot-stable name; Docker does not inject compose
// container names by default. Never assign the same id to two live replicas of the same role.
func Replica() string {
	var raw string
	for _, key := range []string{
		"OTEL_SERVICE_INSTANCE_ID",
		"WS_CONSUMER_NAME",
		"DOCKER_CONTAINER_NAME",
		"CONTAINER_NAME",
		"HOSTNAME",
	} {
		if v := strings.TrimSpace(os.Getenv(key)); v != "" {
			raw = v
			break
		}
	}
	if raw == "" {
		if h, err := os.Hostname(); err == nil && h != "" {
			raw = h
		} else {
			raw = "local"
		}
	}
	s := replicaSanitizer.ReplaceAllString(raw, "_")
	s = strings.Trim(s, "_")
	if s == "" {
		s = "local"
	}
	if len(s) > 64 {
		s = s[:64]
	}
	return s
}
