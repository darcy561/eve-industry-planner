package middleware

import (
	"net/http"
	"strings"

	"eve-industry-planner/api/helper/auth"
	"eve-industry-planner/shared/core/internaljwt"
	"eve-industry-planner/shared/logs"

	"github.com/redis/go-redis/v9"
)

// AuthConstructor creates middleware that validates Authorization header and JWT token,
// then requires X-Session-ID to match the JWT session_id claim and the Redis session record
// (session:<id>) account_id to match the JWT (same binding as BearerInternalJWTValid).
// Rejects requests if Authorization header is missing or token is invalid (always 401 Unauthorized).
// Private routes chain this after rate limiting; batch clients should not retry 401 without refreshing auth.
func AuthConstructor(redisClient *redis.Client) MiddlewareConstructor {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Extract Authorization header
			authHeader := r.Header.Get("Authorization")
			if authHeader == "" {
				logs.WarnCtx(r.Context(), "missing Authorization header")
				http.Error(w, "Unauthorized", http.StatusUnauthorized)
				return
			}

			// Extract Bearer token
			const bearerPrefix = "Bearer "
			if !strings.HasPrefix(authHeader, bearerPrefix) {
				logs.WarnCtx(r.Context(), "invalid Authorization header format")
				http.Error(w, "Unauthorized", http.StatusUnauthorized)
				return
			}

			tokenString := strings.TrimSpace(authHeader[len(bearerPrefix):])
			if tokenString == "" {
				logs.WarnCtx(r.Context(), "empty token in Authorization header")
				http.Error(w, "Unauthorized", http.StatusUnauthorized)
				return
			}

			// Validate internal JWT token
			claims, err := internaljwt.ValidateInternalJWT(tokenString)
			if err != nil {
				logs.WarnCtx(r.Context(), "failed to validate internal JWT token", "error", err)
				http.Error(w, auth.GetAuthErrorMessage(err), http.StatusUnauthorized)
				return
			}

			if !auth.SessionHeaderMatchesJWTClaims(r, claims) {
				logs.WarnCtx(r.Context(), "X-Session-ID does not match JWT session_id claim")
				http.Error(w, "Unauthorized", http.StatusUnauthorized)
				return
			}

			if redisClient == nil || !auth.SessionRedisMatchesJWTClaims(r.Context(), redisClient, claims) {
				logs.WarnCtx(r.Context(), "Redis session record missing or account_id does not match JWT")
				http.Error(w, "Unauthorized", http.StatusUnauthorized)
				return
			}

			// Continue to next handler
			next.ServeHTTP(w, r)
		})
	}
}
