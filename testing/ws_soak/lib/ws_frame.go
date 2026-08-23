package soaklib

import (
	"bytes"
)

// bytesEqASCII reports whether raw equals an ASCII literal without allocating.
func bytesEqASCII(raw []byte, lit string) bool {
	if len(raw) != len(lit) {
		return false
	}
	for i := 0; i < len(lit); i++ {
		if raw[i] != lit[i] {
			return false
		}
	}
	return true
}

// extractJSONStringField pulls a top-level JSON string field value without full unmarshal.
// Handles "key":"value" with optional whitespace; returns "" if missing/invalid.
func extractJSONStringField(raw []byte, key string) string {
	if len(raw) == 0 || key == "" {
		return ""
	}
	needle := []byte(`"` + key + `"`)
	i := bytes.Index(raw, needle)
	if i < 0 {
		return ""
	}
	j := i + len(needle)
	for j < len(raw) && (raw[j] == ' ' || raw[j] == '\t' || raw[j] == '\n' || raw[j] == '\r') {
		j++
	}
	if j >= len(raw) || raw[j] != ':' {
		return ""
	}
	j++
	for j < len(raw) && (raw[j] == ' ' || raw[j] == '\t' || raw[j] == '\n' || raw[j] == '\r') {
		j++
	}
	if j >= len(raw) || raw[j] != '"' {
		return ""
	}
	j++
	start := j
	for j < len(raw) {
		if raw[j] == '\\' {
			j += 2
			continue
		}
		if raw[j] == '"' {
			return string(raw[start:j])
		}
		j++
	}
	return ""
}
