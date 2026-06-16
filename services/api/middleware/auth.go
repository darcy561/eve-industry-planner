package middleware

import (
	"encoding/json"
	"net/http"

	"eve-industry-planner/api/helper"
	"eve-industry-planner/api/helper/auth"
	"eve-industry-planner/shared/dependency"
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

func respondAuthDependencyUnavailable(w http.ResponseWriter, r *http.Request, logMsg string, err error, extra map[string]interface{}) {
	helper.RespondEndpointError(w, r, http.StatusServiceUnavailable, "Service temporarily unavailable", logMsg, "auth_dependency_unavailable", "auth", err, extra)
}

// AuthConstructor validates the shared session cookie against account session state.
func AuthConstructor(redisClient *redis.Client) MiddlewareConstructor {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			identity, err := auth.ExtractAccountSession(r.Context(), r, redisClient)
			if err != nil {
				if auth.IsInfrastructureError(err) || dependency.IsUnavailable(err) {
					detail := auth.AuthSessionFailureDetailFromError(err, r)
					extra := detail.ClientFailureDetail(map[string]interface{}{"error": err.Error()})
					respondAuthDependencyUnavailable(w, r, "auth session validation failed: dependency unavailable", err, extra)
					return
				}
				detail := auth.AuthSessionFailureDetailFromError(err, r)
				switch detail.Code {
				case "session_missing", "session_revoked", "reauth_required":
					logs.AttachClientFailureDetail(r, detail.ClientFailureMessage(), detail.ClientFailureDetail(nil))
					writeAuthError(w, http.StatusUnauthorized, detail.Code)
				default:
					logs.AttachClientFailureDetail(r, detail.ClientFailureMessage(), detail.ClientFailureDetail(map[string]interface{}{
						"error": err.Error(),
					}))
					writeAuthError(w, http.StatusUnauthorized, "session_missing")
				}
				return
			}
			if err := auth.TouchAccountSession(r.Context(), redisClient, identity.AccountID, identity.SessionID, identity.Session.AppVersion); err != nil {
				if dependency.IsUnavailable(err) {
					respondAuthDependencyUnavailable(w, r, "failed to touch account session: dependency unavailable", err, map[string]interface{}{
						"account_id": identity.AccountID,
						"session_id": identity.SessionID,
					})
					return
				}
				logs.AttachClientFailureDetail(r, "failed to touch account session", map[string]interface{}{
					"failure_class": "auth_session_touch_failed",
					"code":          "session_missing",
					"account_id":    identity.AccountID,
					"session_id":    identity.SessionID,
					"error":         err.Error(),
				})
				writeAuthError(w, http.StatusUnauthorized, "session_missing")
				return
			}
			ctx := auth.WithAuthIdentity(r.Context(), identity.AccountID, identity.SessionID)
			ctx = logs.BindRequestIdentity(ctx, identity.AccountID, identity.SessionID)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}
