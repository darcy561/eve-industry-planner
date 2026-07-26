package v1endpoints

import (
	"errors"
	"eve-industry-planner/shared/stackservices"
	"net/http"
	"strings"

	"eve-industry-planner/api/helper"
	"eve-industry-planner/api/helper/auth"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/telemetry/apimetrics"
)

type LogoutRequest struct {
	RefreshToken string `json:"refresh_token"`
}

// LogoutHandler ends the planner auth session: revokes refresh_token:<token> (and session_refresh index),
// deletes the account_sessions row, clears HttpOnly cookies (eip_session, eip_app_refresh, esi oauth storage,
// eip_tenant_affinity), and records metrics.
//
// It does not touch Mongo users.refreshTokens (encrypted ESI OAuth refresh secrets for cloud-linked characters).
func LogoutHandler(w http.ResponseWriter, r *http.Request, clients *stackservices.Clients) {
	ctx := r.Context()
	sessionMetrics := apimetrics.GetAPIAuthSessionLifecycle()
	credLog := auth.BuildRefreshCredentialLogDetail(r, "sessions_logout", "", false, "")

	if !helper.RequireMethod(w, r, http.MethodPost) {
		attachLogoutClientFailure(r, credLog, "invalid method for logout endpoint", "auth_logout_method_not_allowed", map[string]interface{}{
			"metric": "sessions_logout",
			"method": r.Method,
		})
		return
	}

	requestedAccountID := helper.AuthenticatedAccountID(r)

	refreshToken, refreshFromCookie, err := extractLogoutRefreshTokenFromRequest(r)
	credLog = auth.BuildRefreshCredentialLogDetail(r, "sessions_logout", refreshToken, refreshFromCookie, "")
	if err != nil {
		respondLogoutClientError(w, r, credLog, http.StatusBadRequest, "Invalid request", "failed to extract refresh token for logout", "auth_logout_extraction_error", map[string]interface{}{
			"metric": "sessions_logout",
			"error":  err.Error(),
		})
		return
	}
	if len(refreshToken) > maxRefreshTokenLength {
		respondLogoutClientError(w, r, credLog, http.StatusBadRequest, "Invalid request", "refresh token too long for logout", "auth_logout_refresh_token_too_long", map[string]interface{}{
			"metric": "sessions_logout",
			"length": len(refreshToken),
			"max":    maxRefreshTokenLength,
		})
		return
	}

	logs.AttachDebugStep(r, "logout_credentials_extracted", map[string]interface{}{
		"refresh_from_cookie": refreshFromCookie,
		"refresh_token_len":   len(refreshToken),
	})

	tokenData, err := auth.GetRefreshTokenData(ctx, clients.Redis, refreshToken)
	if err != nil {
		respondLogoutClientError(w, r, credLog, http.StatusUnauthorized, "Invalid token", "logout refresh token not found in Redis", "auth_logout_refresh_token_not_found", map[string]interface{}{
			"metric": "sessions_logout",
			"error":  err.Error(),
		})
		return
	}
	if tokenData.AccountID != requestedAccountID {
		respondLogoutClientError(w, r, credLog, http.StatusUnauthorized, "Unauthorized", "logout token/account mismatch", "auth_logout_account_mismatch", map[string]interface{}{
			"metric":               "sessions_logout",
			"requested_account_id": requestedAccountID,
			"token_account_id":     tokenData.AccountID,
		})
		return
	}

	sessionID := auth.SessionIDFromContext(r.Context())
	if sessionID == "" {
		sessionID = strings.TrimSpace(tokenData.SessionID)
	}
	if err := auth.RevokeRefreshTokensForLogout(ctx, clients.Redis, refreshToken, sessionID); err != nil {
		helper.RespondEndpointServerError(w, r, "Internal server error", "failed to revoke refresh token on logout", "auth_logout_revoke_refresh", "sessions_logout", err, map[string]interface{}{
			"session_endpoint": "sessions_logout",
			"session_id_set":   sessionID != "",
		})
		return
	}
	if sessionID != "" {
		if err := auth.RevokeAccountSession(ctx, clients.Redis, requestedAccountID, sessionID); err != nil {
			helper.RespondEndpointServerError(w, r, "Internal server error", "failed to delete session record on logout", "auth_logout_revoke_session", "sessions_logout", err, map[string]interface{}{
				"session_endpoint": "sessions_logout",
				"session_id_set":   sessionID != "",
			})
			return
		}
	}

	sessionMetrics.Ended.WithLabelValues("logout").Inc(ctx)
	auth.ClearAppRefreshCookie(w, r)
	auth.ClearEsiOAuthStorageCookie(w, r)
	auth.ClearTenantAffinityCookie(w, r)
	auth.ClearAppSessionCookie(w)
	logs.AttachDebugStep(r, "session_revoked", map[string]interface{}{
		"session_id_set": sessionID != "",
	})
	logs.AttachHandlerSuccessDetail(r, "logout completed", map[string]interface{}{
		"refresh_from_cookie": refreshFromCookie,
	})
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
