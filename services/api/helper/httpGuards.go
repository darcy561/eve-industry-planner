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

// RequireAccountID extracts accountID from internal JWT and writes 401 when unavailable.
func RequireAccountID(w http.ResponseWriter, r *http.Request) (string, bool) {
	accountID, err := auth.ExtractAccountID(r)
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return "", false
	}
	return accountID, true
}
