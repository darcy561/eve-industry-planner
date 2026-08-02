// Envfile helpers read operator .env-style KEY=VALUE files.
package kit

import (
	"fmt"
	"os"
	"strings"

	"github.com/joho/godotenv"
)

// Map loads path into a string map (empty file → empty map).
func Map(path string) (map[string]string, error) {
	m, err := godotenv.Read(path)
	if err != nil {
		return nil, fmt.Errorf("read %s: %w", path, err)
	}
	if m == nil {
		m = map[string]string{}
	}
	return m, nil
}

// Get returns a trimmed value for key, or "".
func Get(m map[string]string, key string) string {
	if m == nil {
		return ""
	}
	return strings.TrimSpace(m[key])
}

// Truthy reports whether s is a common affirmative (1/true/yes).
func Truthy(s string) bool {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "1", "true", "yes":
		return true
	default:
		return false
	}
}

// MergeEnviron returns os.Environ() plus overlays (later maps win).
func MergeEnviron(overlays ...map[string]string) []string {
	merged := map[string]string{}
	for _, kv := range os.Environ() {
		k, v, ok := strings.Cut(kv, "=")
		if ok {
			merged[k] = v
		}
	}
	for _, m := range overlays {
		for k, v := range m {
			if k == "" {
				continue
			}
			merged[k] = v
		}
	}
	out := make([]string, 0, len(merged))
	for k, v := range merged {
		out = append(out, k+"="+v)
	}
	return out
}
