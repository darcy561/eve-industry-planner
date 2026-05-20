package ref

import "strings"

func ParseRefVersion(ref string) (version string, kind string, ok bool) {
	parts := strings.SplitN(strings.TrimSpace(ref), "_", 3)
	if len(parts) != 3 {
		return "", "", false
	}
	version = parts[0]
	kind = parts[1]
	if version == "" || !strings.HasPrefix(version, "v") {
		return "", "", false
	}
	if kind != "char" && kind != "corp" && kind != "alliance" {
		return "", "", false
	}
	if parts[2] == "" {
		return "", "", false
	}
	return version, kind, true
}

func ValidateRefShape(ref string) bool {
	version, kind, ok := ParseRefVersion(ref)
	if !ok || version == "" || kind == "" {
		return false
	}
	parts := strings.SplitN(strings.TrimSpace(ref), "_", 3)
	token := parts[2]
	for _, r := range token {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '-' || r == '_' {
			continue
		}
		return false
	}
	return true
}
