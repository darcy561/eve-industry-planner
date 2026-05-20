package helper

import (
	"net/http"

	"eve-industry-planner/api/helper/auth"
)

// RequireMethod enforces a specific HTTP method and writes 405 when mismatched.
func RequireMethod(w http.ResponseWriter, r *http.Request, expected string) bool {
	if r.Method == expected {
		return true
	}
	http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	return false
}

// RequireAccountID extracts accountID from session context (or legacy JWT fallback) and writes 401 when unavailable.
func RequireAccountID(w http.ResponseWriter, r *http.Request) (string, bool) {
	if fromCtx := auth.AccountIDFromContext(r.Context()); fromCtx != "" {
		return fromCtx, true
	}
	http.Error(w, "Unauthorized", http.StatusUnauthorized)
	return "", false
}
