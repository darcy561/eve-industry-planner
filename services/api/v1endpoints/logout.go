package v1endpoints

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"

	"eve-industry-planner/api/helper/auth"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/shared"
	"eve-industry-planner/shared/telemetry/apimetrics"
)

type LogoutRequest struct {
	RefreshToken string `json:"refresh_token"`
}

// LogoutHandler revokes the current server refresh token and records a session-end metric.
func LogoutHandler(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	ctx := r.Context()
	sessionMetrics := apimetrics.GetAPIAuthSessionLifecycle()

	if r.Method != http.MethodPost {
		logs.WarnCtx(ctx, "invalid method for logout endpoint")
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	requestedAccountID, err := auth.ExtractAccountID(r)
	if err != nil {
		logs.WarnCtx(ctx, "failed to extract account id for logout", "error", err)
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	refreshToken, err := extractLogoutRefreshTokenFromRequest(r)
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

	tokenData, err := auth.GetRefreshTokenData(ctx, clients.Redis, refreshToken)
	if err != nil {
		logs.WarnCtx(ctx, "logout refresh token not found", "error", err)
		http.Error(w, "Invalid token", http.StatusUnauthorized)
		return
	}
	if tokenData.AccountID != requestedAccountID {
		logs.WarnCtx(ctx, "logout token/account mismatch", "requested_account_id", requestedAccountID, "token_account_id", tokenData.AccountID)
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	if err := auth.RevokeRefreshToken(ctx, clients.Redis, refreshToken); err != nil {
		logs.ErrorCtx(ctx, "failed to revoke refresh token on logout", "error", err, "account_id", requestedAccountID)
		logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Internal server error", err)
		return
	}

	sessionMetrics.Ended.WithLabelValues("logout").Inc(ctx)
	w.WriteHeader(http.StatusNoContent)
}

func extractLogoutRefreshTokenFromRequest(r *http.Request) (string, error) {
	r.Body = http.MaxBytesReader(nil, r.Body, maxRefreshTokenLength+1024)
	var reqBody LogoutRequest

	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()

	if err := decoder.Decode(&reqBody); err != nil {
		if err == io.EOF {
			return "", errors.New("request body is required")
		}
		if strings.Contains(err.Error(), "request body too large") {
			return "", errors.New("request body too large")
		}
		return "", fmt.Errorf("invalid request body: %w", err)
	}
	if _, err := decoder.Token(); err != io.EOF {
		return "", errors.New("request body contains extra data")
	}

	token := strings.TrimSpace(reqBody.RefreshToken)
	if token == "" {
		return "", errors.New("refresh_token is required in request body")
	}
	return token, nil
}
