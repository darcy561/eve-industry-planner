package v1endpoints

import (
	"errors"
	"net/http"
	"strings"

	"eve-industry-planner/api/helper"
	"eve-industry-planner/api/helper/auth"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/shared"
	"eve-industry-planner/shared/telemetry/apimetrics"
)

type LogoutRequest struct {
	RefreshToken string `json:"refresh_token"`
}

// LogoutHandler ends the planner auth session: revokes refresh_token:<token> (and session_refresh index),
// deletes the account_sessions row, clears HttpOnly cookies (eip_session, eip_app_refresh, esi oauth storage),
// and records metrics.
//
// It does not touch Mongo users.refreshTokens (encrypted ESI OAuth refresh secrets for cloud-linked characters).
func LogoutHandler(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	ctx := r.Context()
	sessionMetrics := apimetrics.GetAPIAuthSessionLifecycle()

	if !helper.RequireMethod(w, r, http.MethodPost) {
		logs.WarnCtx(ctx, "invalid method for logout endpoint")
		return
	}

	requestedAccountID, ok := helper.RequireAccountID(w, r)
	if !ok {
		logs.WarnCtx(ctx, "failed to extract account id for logout")
		return
	}

	refreshToken, refreshFromCookie, err := extractLogoutRefreshTokenFromRequest(r)
	if err != nil {
		logs.WarnCtx(ctx, "failed to extract refresh token for logout", "error", err)
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}
	if len(refreshToken) > maxRefreshTokenLength {
		logs.WarnCtx(ctx, "refresh token too long for logout", "length", len(refreshToken), "max", maxRefreshTokenLength)
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	credLog := auth.BuildRefreshCredentialLogDetail(r, "sessions_logout", refreshToken, refreshFromCookie, "")

	tokenData, err := auth.GetRefreshTokenData(ctx, clients.Redis, refreshToken)
	if err != nil {
		logs.WarnCtx(ctx, "logout refresh token not found in Redis",
			"error", err,
			"credential_source", credLog.CredentialSource,
			"refresh_token_id_hint", credLog.RefreshTokenIDHint,
			"likely_cause", credLog.LikelyCause,
		)
		http.Error(w, "Invalid token", http.StatusUnauthorized)
		return
	}
	if tokenData.AccountID != requestedAccountID {
		logs.WarnCtx(ctx, "logout token/account mismatch", "requested_account_id", requestedAccountID, "token_account_id", tokenData.AccountID)
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	sessionID := auth.SessionIDFromContext(r.Context())
	if sessionID == "" {
		sessionID = strings.TrimSpace(tokenData.SessionID)
	}
	if err := auth.RevokeRefreshTokensForLogout(ctx, clients.Redis, refreshToken, sessionID); err != nil {
		helper.RespondEndpointServerError(w, r, "Internal server error", "failed to revoke refresh token on logout", "auth_logout_revoke_refresh", "sessions_logout", err, map[string]interface{}{
			"session_endpoint": "sessions_logout",
			"account_id":       requestedAccountID,
			"session_id_set":   sessionID != "",
		})
		return
	}
	if sessionID != "" {
		if err := auth.RevokeAccountSession(ctx, clients.Redis, requestedAccountID, sessionID); err != nil {
			helper.RespondEndpointServerError(w, r, "Internal server error", "failed to delete session record on logout", "auth_logout_revoke_session", "sessions_logout", err, map[string]interface{}{
				"session_endpoint": "sessions_logout",
				"account_id":       requestedAccountID,
				"session_id_set":   sessionID != "",
			})
			return
		}
	}

	sessionMetrics.Ended.WithLabelValues("logout").Inc(ctx)
	auth.ClearAppRefreshCookie(w, r)
	auth.ClearEsiOAuthStorageCookie(w, r)
	auth.ClearAppSessionCookie(w)
	w.WriteHeader(http.StatusNoContent)
}

func extractLogoutRefreshTokenFromRequest(r *http.Request) (refreshToken string, refreshFromCookie bool, err error) {
	var reqBody LogoutRequest
	if err := helper.DecodeJSONRequest(r, &reqBody, maxRefreshTokenLength+1024); err != nil {
		return "", false, err
	}

	bodyRT := strings.TrimSpace(reqBody.RefreshToken)
	cookieRT := auth.ReadAppRefreshCookie(r)
	if bodyRT != "" {
		return bodyRT, false, nil
	}
	if cookieRT != "" {
		return cookieRT, true, nil
	}
	return "", false, errors.New("refresh_token is required in request body or cookie")
}
