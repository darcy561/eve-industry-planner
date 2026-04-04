package middleware

import (
	"net/http"
	"strings"

	"eve-industry-planner/api/helper/auth"
	"eve-industry-planner/shared/shared/logs"
)

// AuthConstructor creates middleware that validates Authorization header and JWT token
// Rejects requests if Authorization header is missing or token is invalid
func AuthConstructor() MiddlewareConstructor {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Extract Authorization header
			authHeader := r.Header.Get("Authorization")
			if authHeader == "" {
				logs.Warn("missing Authorization header", "method", r.Method, "path", r.URL.Path, "ip", r.RemoteAddr)
				http.Error(w, "Unauthorized", http.StatusUnauthorized)
				return
			}

			// Extract Bearer token
			const bearerPrefix = "Bearer "
			if !strings.HasPrefix(authHeader, bearerPrefix) {
				logs.Warn("invalid Authorization header format", "method", r.Method, "path", r.URL.Path, "ip", r.RemoteAddr)
				http.Error(w, "Unauthorized", http.StatusUnauthorized)
				return
			}

			tokenString := strings.TrimSpace(authHeader[len(bearerPrefix):])
			if tokenString == "" {
				logs.Warn("empty token in Authorization header", "method", r.Method, "path", r.URL.Path, "ip", r.RemoteAddr)
				http.Error(w, "Unauthorized", http.StatusUnauthorized)
				return
			}

			// Validate internal JWT token
			claims, err := auth.ValidateInternalJWT(tokenString)
			if err != nil {
				logs.Warn("failed to validate internal JWT token", "error", err, "method", r.Method, "path", r.URL.Path, "ip", r.RemoteAddr)
				http.Error(w, auth.GetAuthErrorMessage(err), http.StatusUnauthorized)
				return
			}

			// Store claims in request context for handlers to access if needed
			// You can extend this later to add claims to context
			_ = claims

			// Continue to next handler
			next.ServeHTTP(w, r)
		})
	}
}
