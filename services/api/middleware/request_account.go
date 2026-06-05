package middleware

import (
	"net/http"

	"eve-industry-planner/api/helper/auth"
	"eve-industry-planner/shared/logs"

	"github.com/redis/go-redis/v9"
)

func bindRequestIdentity(r *http.Request, accountID, sessionID string) *http.Request {
	return logs.BindRequestIdentityToRequest(r, accountID, sessionID)
}

// OptionalAccountLogConstructor resolves a valid session cookie when present and binds account_id
// and session_id for consolidated logging on public routes. It never rejects the request.
func OptionalAccountLogConstructor(redisClient *redis.Client) MiddlewareConstructor {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if redisClient != nil {
				if identity, ok := auth.TryExtractAccountSession(r.Context(), r, redisClient); ok && identity != nil {
					r = bindRequestIdentity(r, identity.AccountID, identity.SessionID)
				}
			}
			next.ServeHTTP(w, r)
		})
	}
}
