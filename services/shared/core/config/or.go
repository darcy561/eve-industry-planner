package config

// or returns v when non-empty, otherwise fallback.
func or(v, fallback string) string {
	if v != "" {
		return v
	}
	return fallback
}
