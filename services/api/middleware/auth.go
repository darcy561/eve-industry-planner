package middleware

import (
	"encoding/json"
	"net/http"

	"eve-industry-planner/api/helper/auth"
	"eve-industry-planner/shared/logs"

	"github.com/redis/go-redis/v9"
)

type authErrorResponse struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

func writeAuthError(w http.ResponseWriter, status int, code string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(authErrorResponse{
		Code:    code,
		Message: "Unauthorized",
	})
}

// AuthConstructor validates the shared session cookie against account session state.
func AuthConstructor(redisClient *redis.Client) MiddlewareConstructor {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			identity, err := auth.ExtractAccountSession(r.Context(), r, redisClient)
			if err != nil {
				code := err.Error()
				switch code {
				case "session_missing", "session_revoked", "reauth_required":
					logs.WarnCtx(r.Context(), "auth session invalid", "code", code)
					writeAuthError(w, http.StatusUnauthorized, code)
				default:
					logs.WarnCtx(r.Context(), "auth session validation failed", "error", err)
					writeAuthError(w, http.StatusUnauthorized, "session_missing")
				}
				return
			}
			if err := auth.TouchAccountSession(r.Context(), redisClient, identity.AccountID, identity.SessionID, identity.Session.AppVersion); err != nil {
				logs.WarnCtx(r.Context(), "failed to touch account session", "error", err)
				writeAuthError(w, http.StatusUnauthorized, "session_missing")
				return
			}
			ctx := auth.WithAuthIdentity(r.Context(), identity.AccountID, identity.SessionID)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}
