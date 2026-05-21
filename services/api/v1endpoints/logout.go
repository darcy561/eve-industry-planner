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

// LogoutHandler ends the planner auth session: deletes Redis session:<session_id>, clears the HttpOnly
// app session refresh cookie (eip_app_refresh), clears eip_esi_oauth_storage, and records metrics.
//
// It does not delete the Redis key refresh_token:<planner_app_refresh_token> (planner session material)
// or touch Mongo users.refreshTokens (encrypted ESI OAuth refresh secrets for cloud-linked characters).
// Invalid planner or ESI credentials are handled when those flows run again (may require full EVE SSO).
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
	if sessionID != "" {
		if err := auth.RevokeAccountSession(ctx, clients.Redis, requestedAccountID, sessionID); err != nil {
			logs.ErrorCtx(ctx, "failed to delete session record on logout", "error", err, "account_id", requestedAccountID)
			logs.AttachHandlerFailureDetail(r, map[string]interface{}{
				"failure_class":    "auth_logout_revoke_session",
				"session_endpoint": "sessions_logout",
				"account_id":       requestedAccountID,
				"session_id_set":   sessionID != "",
			})
			logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Internal server error", err)
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
