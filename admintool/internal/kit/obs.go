// Package kit embeds observability configs (obs/) for Swarm config Sync/Apply.
package kit

import (
	"embed"
	"fmt"
	"path"
	"strings"
)

//go:embed obs/**
var obsContent embed.FS

const hostPrefix = "observability/"

// ReadObs returns embedded bytes for a path under obs/ (e.g. "prometheus/prometheus.yml").
func ReadObs(rel string) ([]byte, error) {
	rel = normalizeObsRel(rel)
	if rel == "" {
		return nil, fmt.Errorf("kit.ReadObs: empty path")
	}
	raw, err := obsContent.ReadFile("obs/" + rel)
	if err != nil {
		return nil, fmt.Errorf("kit obs: %s: %w", rel, err)
	}
	return append([]byte(nil), raw...), nil
}

// EmbedRelFromHostFile maps stack file: ./observability/foo ? foo when present in embed.
func EmbedRelFromHostFile(file string) (string, bool) {
	rel := normalizeObsRel(file)
	if rel == "" {
		return "", false
	}
	if _, err := obsContent.ReadFile("obs/" + rel); err != nil {
		return "", false
	}
	return rel, true
}

func normalizeObsRel(file string) string {
	file = strings.TrimSpace(file)
	file = strings.ReplaceAll(file, "\\", "/")
	file = strings.TrimPrefix(file, "./")
	file = strings.TrimPrefix(file, hostPrefix)
	file = path.Clean(file)
	if file == "." || file == "" || strings.HasPrefix(file, "../") {
		return ""
	}
	return file
}
