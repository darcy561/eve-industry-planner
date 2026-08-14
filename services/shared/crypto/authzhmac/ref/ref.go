// Package ref parses and validates the deterministic entity refs produced by
// [eve-industry-planner/shared/crypto/authzhmac/helper].
//
// A ref is "{version}_{kind}_{token}", where kind is char, corp, or alliance.
package ref

import "strings"

// ParseRefVersion splits a ref into its version and kind, reporting whether the
// ref is well formed.
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

// ValidateRefShape reports whether a ref is well formed and its token holds only
// base64url characters.
func ValidateRefShape(ref string) bool {
	_, _, ok := ParseRefVersion(ref)
	if !ok {
		return false
	}
	token := strings.SplitN(strings.TrimSpace(ref), "_", 3)[2]
	for _, r := range token {
		switch {
		case r >= 'a' && r <= 'z':
		case r >= 'A' && r <= 'Z':
		case r >= '0' && r <= '9':
		case r == '-' || r == '_':
		default:
			return false
		}
	}
	return true
}
