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
	RespondEndpointError(w, r, http.StatusMethodNotAllowed, "Method not allowed", "method not allowed", "method_not_allowed", "", nil, map[string]interface{}{
		"method":          r.Method,
		"expected_method": expected,
	})
	return false
}

// AuthenticatedAccountID returns the account id bound by auth middleware on private routes.
func AuthenticatedAccountID(r *http.Request) string {
	return auth.AccountIDFromContext(r.Context())
}

// AuthenticatedSessionID returns the session id bound by auth middleware on private routes.
func AuthenticatedSessionID(r *http.Request) string {
	return auth.SessionIDFromContext(r.Context())
}

// RequireAccountID extracts accountID set by auth middleware and writes 401 when unavailable.
// Prefer [AuthenticatedAccountID] on routes behind [middleware.AuthConstructor].
func RequireAccountID(w http.ResponseWriter, r *http.Request) (string, bool) {
	if accountID := AuthenticatedAccountID(r); accountID != "" {
		return accountID, true
	}
	RespondEndpointError(w, r, http.StatusUnauthorized, "Unauthorized", "missing authenticated account id", "auth_missing_account_id", "", nil, nil)
	return "", false
}
