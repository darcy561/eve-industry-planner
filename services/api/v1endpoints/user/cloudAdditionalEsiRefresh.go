package user

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"eve-industry-planner/api/helper"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"eve-industry-planner/api/helper/auth"
	"eve-industry-planner/shared/core/config"
	mongocore "eve-industry-planner/shared/core/mongo"
	"eve-industry-planner/shared/core/retry"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/shared"
	"eve-industry-planner/shared/shared/models"
	"eve-industry-planner/shared/telemetry/apimetrics"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
)

const eveSSOTokenURL = "https://login.eveonline.com/v2/oauth/token"

type additionalEsiRefreshRequest struct {
	CharacterHash        string `json:"character_hash"`
	ClientAccessTokenExp int64  `json:"client_access_token_exp,omitempty"`
}

type additionalEsiRefreshResponse struct {
	AccessToken string `json:"access_token"`
	TokenType   string `json:"token_type"`
	ExpiresIn   int    `json:"expires_in"`
}

type eveSSOTokenResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	TokenType    string `json:"token_type"`
	ExpiresIn    int    `json:"expires_in"`
}

type eveSSOErrorResponse struct {
	Error            string `json:"error"`
	ErrorDescription string `json:"error_description"`
}

type eveSSORetryableError struct {
	err error
}

func (e eveSSORetryableError) Error() string { return e.err.Error() }
func (e eveSSORetryableError) Unwrap() error { return e.err }

// CloudAdditionalCharacterEsiRefreshHandler refreshes a cloud-stored additional character's
// ESI access token server-side (no refresh token returned to the client).
func CloudAdditionalCharacterEsiRefreshHandler(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	ctx := r.Context()
	start := helper.RequestStartOrNow(ctx)
	m := apimetrics.GetAPIEveSSOTokenRefresh()

	if !helper.RequireMethod(w, r, http.MethodPost) {
		m.Errors.WithLabelValues("method_not_allowed").Inc(ctx)
		return
	}

	claims, err := auth.ExtractInternalClaims(r)
	if err != nil {
		m.Errors.WithLabelValues("auth_error").Inc(ctx)
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	accountID := claims.AccountID
	mainHash := claims.CharacterHash

	cfg, err := config.LoadConfig()
	if err != nil {
		m.Errors.WithLabelValues("config_error").Inc(ctx)
		logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Internal server error", err)
		return
	}
	if cfg.RefreshTokenKeyring == nil {
		m.Errors.WithLabelValues("config_error").Inc(ctx)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	var req additionalEsiRefreshRequest
	if err := helper.DecodeJSONRequest(r, &req, 2048); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	targetHash := strings.TrimSpace(req.CharacterHash)
	if targetHash == "" {
		http.Error(w, "character_hash is required", http.StatusBadRequest)
		return
	}
	if mainHash != "" && strings.EqualFold(strings.TrimSpace(mainHash), strings.TrimSpace(targetHash)) {
		http.Error(w, "main character must not use this endpoint", http.StatusForbidden)
		return
	}

	database := clients.Mongo.Database(mongocore.DatabaseName)
	usersCol := database.Collection(mongocore.CollectionUsers)
	var userDoc models.UserAccountDocument
	if err := usersCol.FindOne(ctx, bson.M{"_id": accountID, "_meta.accountID": accountID}).Decode(&userDoc); err != nil {
		if err == mongo.ErrNoDocuments {
			http.Error(w, "user document not found", http.StatusNotFound)
			return
		}
		m.Errors.WithLabelValues("database_error").Inc(ctx)
		logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Internal server error", err)
		return
	}
	if !userDoc.UserCloudAccounts {
		http.Error(w, "cloud storage mode is not enabled", http.StatusForbidden)
		return
	}

	var row *models.RefreshToken
	for i := range userDoc.RefreshTokens {
		if strings.EqualFold(userDoc.RefreshTokens[i].CharacterHash, targetHash) {
			row = &userDoc.RefreshTokens[i]
			break
		}
	}
	if row == nil {
		http.Error(w, "character not linked for this account", http.StatusForbidden)
		return
	}

	plain, err := row.PlainRefreshMaterial(cfg.RefreshTokenKeyring)
	if err != nil {
		m.Errors.WithLabelValues("extraction_error").Inc(ctx)
		http.Error(w, "stored refresh token unavailable", http.StatusInternalServerError)
		return
	}

	refreshCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	tok, err := refreshEveSSOAccessToken(refreshCtx, cfg.EveSSOClientID, cfg.EveSSOClientSecret, plain)
	if err != nil {
		m.Errors.WithLabelValues("sso_refresh_error").Inc(ctx)
		if strings.Contains(err.Error(), "invalid_grant") || strings.Contains(err.Error(), "invalid_request") {
			http.Error(w, "Invalid refresh token", http.StatusBadRequest)
		} else {
			logs.RespondHTTPError(w, r, http.StatusBadGateway, "Failed to refresh token", err)
		}
		return
	}

	newRefresh := tok.RefreshToken
	if newRefresh == "" {
		newRefresh = plain
	}
	if err := row.EncryptRefreshAtRest(newRefresh, cfg.RefreshTokenKeyring); err != nil {
		m.Errors.WithLabelValues("encode_error").Inc(ctx)
		logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Internal server error", err)
		return
	}

	retryCfg := mongocore.DefaultRetryConfig()
	retryCfg.OperationName = "persist additional character ESI refresh"
	if err := mongocore.RetryMongoOperation(ctx, retryCfg, func() error {
		_, err := usersCol.UpdateOne(ctx, bson.M{"_id": accountID, "_meta.accountID": accountID}, bson.M{
			"$set": bson.M{
				"refreshTokens":      userDoc.RefreshTokens,
				"_meta.lastModified": time.Now().UTC(),
			},
		})
		return err
	}); err != nil {
		m.Errors.WithLabelValues("database_error").Inc(ctx)
		logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Internal server error", err)
		return
	}

	resp := additionalEsiRefreshResponse{
		AccessToken: tok.AccessToken,
		TokenType:   tok.TokenType,
		ExpiresIn:   tok.ExpiresIn,
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Pragma", "no-cache")
	w.WriteHeader(http.StatusOK)
	if err := json.NewEncoder(w).Encode(resp); err != nil {
		m.Errors.WithLabelValues("encode_error").Inc(ctx)
		logs.ErrorCtx(ctx, "failed to encode additional ESI refresh response", "error", err)
		return
	}

	duration := time.Since(start)
	m.Requests.Observe(ctx, apimetrics.DurationMilliseconds(duration))
	m.RequestsCount.Inc(ctx)
	m.Successes.Inc(ctx)
}

func refreshEveSSOAccessToken(ctx context.Context, clientID, clientSecret, refreshToken string) (*eveSSOTokenResponse, error) {
	authHeader := base64.StdEncoding.EncodeToString([]byte(clientID + ":" + clientSecret))

	data := url.Values{}
	data.Set("grant_type", "refresh_token")
	data.Set("refresh_token", refreshToken)

	req, err := http.NewRequestWithContext(ctx, "POST", eveSSOTokenURL, strings.NewReader(data.Encode()))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Authorization", "Basic "+authHeader)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Host", "login.eveonline.com")

	return performEveSSOTokenRequestWithRetry(ctx, req)
}

func performEveSSOTokenRequestWithRetry(ctx context.Context, req *http.Request) (*eveSSOTokenResponse, error) {
	client := &http.Client{Timeout: 30 * time.Second}

	var tokenResp eveSSOTokenResponse
	retryErr := retry.Do(ctx, func(ctx context.Context) error {
		attemptReq := req.Clone(ctx)
		if req.GetBody != nil {
			body, err := req.GetBody()
			if err != nil {
				return fmt.Errorf("failed to recreate request body: %w", err)
			}
			attemptReq.Body = body
		}

		resp, err := client.Do(attemptReq)
		if err != nil {
			return eveSSORetryableError{err: fmt.Errorf("failed to make request to EVE SSO: %w", err)}
		}
		defer resp.Body.Close()

		body, err := io.ReadAll(resp.Body)
		if err != nil {
			return eveSSORetryableError{err: fmt.Errorf("failed to read response body: %w", err)}
		}

		if resp.StatusCode == http.StatusNoContent {
			return eveSSORetryableError{err: errors.New("EVE SSO Error: No content received")}
		}

		if resp.StatusCode >= 400 && resp.StatusCode < 500 {
			var errorResp eveSSOErrorResponse
			if err := json.Unmarshal(body, &errorResp); err == nil && errorResp.ErrorDescription != "" {
				return fmt.Errorf("EVE SSO Error: %s", errorResp.ErrorDescription)
			}
			return fmt.Errorf("EVE SSO Error: Unknown error (status %d)", resp.StatusCode)
		}

		if resp.StatusCode >= 500 {
			var serverErr error
			var errorResp eveSSOErrorResponse
			if err := json.Unmarshal(body, &errorResp); err == nil && errorResp.ErrorDescription != "" {
				serverErr = fmt.Errorf("EVE SSO Error: %s", errorResp.ErrorDescription)
			} else {
				serverErr = fmt.Errorf("EVE SSO Error: Server error (status %d)", resp.StatusCode)
			}
			return eveSSORetryableError{err: serverErr}
		}

		if err := json.Unmarshal(body, &tokenResp); err != nil {
			return fmt.Errorf("failed to parse token response: %w", err)
		}
		return nil
	}, func(err error, attempt retry.AttemptContext) bool {
		var retryableErr eveSSORetryableError
		if !errors.As(err, &retryableErr) {
			return false
		}
		logs.WarnCtx(ctx, "retrying EVE SSO token request",
			"attempt", attempt.Attempt,
			"max_attempts", attempt.MaxAttempts,
			"error", err)
		return true
	}, retry.WithOperationName("eve_sso_token_request"))
	if retryErr != nil {
		return nil, retryErr
	}
	return &tokenResp, nil
}
