package v1endpoints

import (
	"net/http"

	"eve-industry-planner/api/helper"
	"eve-industry-planner/api/helper/auth"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/plannersession"
	sessionreq "eve-industry-planner/shared/plannersession/request"
	"eve-industry-planner/shared/telemetry/apimetrics"
)

// RevokeAllSessionsResponse reports what the revoke ended.
type RevokeAllSessionsResponse struct {
	SessionsRevoked int `json:"sessions_revoked"`
	TokensRevoked   int `json:"refresh_tokens_revoked"`
}

// RevokeAllSessionsHandler ends every planner session the calling account holds,
// the one that asked included: this answers a machine somebody else now has, and
// that tab is no more trustworthy than the rest.
func (a *Handlers) RevokeAllSessionsHandler(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	sessionMetrics := apimetrics.GetAPIAuthSessionLifecycle()

	if !helper.RequireMethod(w, r, http.MethodPost) {
		return
	}
	accountID := sessionreq.AccountIDFromContext(ctx)
	if accountID == "" {
		sessionreq.WriteCodedError(w, http.StatusUnauthorized, sessionreq.CodeSessionMissing, "Unauthorized")
		return
	}

	report, err := plannersession.NewStore(a.Redis).RevokeAllSessions(ctx, accountID)
	if err != nil {
		helper.RespondEndpointServerError(w, r, "Internal server error",
			"failed to revoke every session for account", "auth_revoke_all_failed",
			"sessions_revoke_all", err, map[string]any{
				"session_endpoint": "sessions_revoke_all",
			})
		return
	}

	sessionMetrics.Ended.WithLabelValues("revoke_all").Add(ctx, report.Sessions)
	auth.ClearAppRefreshCookie(w, r)
	auth.ClearEsiOAuthStorageCookie(w, r)
	auth.ClearTenantAffinityCookie(w, r)
	sessionreq.ClearSessionCookie(w)

	logs.AttachHandlerSuccessDetail(r, "revoked every session for account", map[string]any{
		"sessions_revoked": report.Sessions,
		"tokens_revoked":   report.Tokens,
	})
	if err := helper.EncodeJSON(w, RevokeAllSessionsResponse{
		SessionsRevoked: report.Sessions,
		TokensRevoked:   report.Tokens,
	}); err != nil {
		helper.RespondEndpointServerError(w, r, "Internal server error",
			"failed to encode revoke-all response", "auth_revoke_all_encode_failed",
			"sessions_revoke_all", err, nil)
	}
}
