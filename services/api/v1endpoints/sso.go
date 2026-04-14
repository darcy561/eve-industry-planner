package v1endpoints

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"eve-industry-planner/api/helper/auth"
	"eve-industry-planner/api/helper/sso"
	"eve-industry-planner/shared/core/config"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/shared"
	"eve-industry-planner/shared/telemetry/apimetrics"
)

const (
	maxAuthCodeLength = 512 // Maximum authorization code length
	eveSSOTokenURL    = "https://login.eveonline.com/v2/oauth/token"
)

// SSOExchangeRequest represents the request body for SSO token exchange
type SSOExchangeRequest struct {
	AuthCode    string `json:"auth_code"`
	AccountType bool   `json:"account_type,omitempty"` // Whether this is an account-level authentication
}

// SSOExchangeResponse represents the response from SSO token exchange
type SSOExchangeResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	TokenType    string `json:"token_type"`
	ExpiresIn    int    `json:"expires_in"`
}

// SSORefreshRequest represents the request body for SSO token refresh
type SSORefreshRequest struct {
	RefreshToken string `json:"refresh_token"`
}

// SSORefreshResponse represents the response from SSO token refresh
type SSORefreshResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	TokenType    string `json:"token_type"`
	ExpiresIn    int    `json:"expires_in"`
}

// EveSSOTokenResponse represents the response from EVE SSO token endpoint
type EveSSOTokenResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	TokenType    string `json:"token_type"`
	ExpiresIn    int    `json:"expires_in"`
}

// EveSSOErrorResponse represents an error response from EVE SSO
type EveSSOErrorResponse struct {
	Error            string `json:"error"`
	ErrorDescription string `json:"error_description"`
}

// SSOExchangeHandler handles SSO authorization code exchange for access token
func SSOExchangeHandler(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	ctx := r.Context()
	start, ok := logs.RequestStartTime(ctx)
	if !ok {
		start = time.Now()
	}
	m := apimetrics.GetAPIEveSSOCodeExchange()
	cfg, err := config.LoadConfig()
	if err != nil {
		duration := time.Since(start)
		m.Errors.WithLabelValues("config_error").Inc(ctx)
		apimetrics.LogRequestMetrics(ctx, "eve_sso_code_exchange", duration, "config_error", "error", err)
		logs.ErrorCtx(ctx, "failed to load config for SSO exchange", "error", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	// Only allow POST requests
	if r.Method != http.MethodPost {
		duration := time.Since(start)
		m.Errors.WithLabelValues("method_not_allowed").Inc(ctx)
		apimetrics.LogRequestMetrics(ctx, "eve_sso_code_exchange", duration, "method_not_allowed")
		logs.WarnCtx(ctx, "invalid method for SSO exchange endpoint")
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Extract authorization code from request body
	authCode, accountType, err := extractAuthCodeFromRequest(r)
	if err != nil {
		duration := time.Since(start)
		m.Errors.WithLabelValues("extraction_error").Inc(ctx)
		apimetrics.LogRequestMetrics(ctx, "eve_sso_code_exchange", duration, "extraction_error",
			"error", err)
		logs.WarnCtx(ctx, "failed to extract auth code from request body", "error", err)
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	// Validate auth code length
	if len(authCode) > maxAuthCodeLength {
		duration := time.Since(start)
		m.Errors.WithLabelValues("auth_code_too_long").Inc(ctx)
		apimetrics.LogRequestMetrics(ctx, "eve_sso_code_exchange", duration, "auth_code_too_long",
			"length", len(authCode), "max", maxAuthCodeLength)
		logs.WarnCtx(ctx, "auth code too long", "length", len(authCode), "max", maxAuthCodeLength)
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	// Validate client ID and secret are configured
	if cfg.EveSSOClientID == "" || cfg.EveSSOClientSecret == "" {
		duration := time.Since(start)
		m.Errors.WithLabelValues("config_error").Inc(ctx)
		apimetrics.LogRequestMetrics(ctx, "eve_sso_code_exchange", duration, "config_error")
		logs.ErrorCtx(ctx, "EVE SSO client ID or secret not configured")
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	// Exchange authorization code for access token
	tokenResponse, err := exchangeAuthCodeForToken(ctx, cfg.EveSSOClientID, cfg.EveSSOClientSecret, authCode)
	var characterHash string
	if err != nil {
		duration := time.Since(start)
		m.Errors.WithLabelValues("sso_exchange_error").Inc(ctx)
		apimetrics.LogRequestMetrics(ctx, "eve_sso_code_exchange", duration, "sso_exchange_error",
			"error", err)
		logs.WarnCtx(ctx, "failed to exchange auth code for token", "error", err)

		// Return appropriate error based on SSO response
		if strings.Contains(err.Error(), "invalid_grant") || strings.Contains(err.Error(), "invalid_request") {
			http.Error(w, "Invalid authorization code", http.StatusBadRequest)
		} else if strings.Contains(err.Error(), "server error") {
			http.Error(w, "EVE SSO server error", http.StatusBadGateway)
		} else {
			http.Error(w, "Failed to authenticate with EVE SSO", http.StatusInternalServerError)
		}
		return
	}

	// Validate access token was received
	if tokenResponse.AccessToken == "" {
		duration := time.Since(start)
		m.Errors.WithLabelValues("no_access_token").Inc(ctx)
		apimetrics.LogRequestMetrics(ctx, "eve_sso_code_exchange", duration, "no_access_token")
		logs.WarnCtx(ctx, "no access token received from EVE SSO")
		http.Error(w, "No access token received from EVE SSO", http.StatusInternalServerError)
		return
	}

	characterHash, extractErr := extractCharacterHashFromToken(tokenResponse.AccessToken, cfg.EveSSOClientID)
	if extractErr != nil {
		logs.WarnCtx(ctx, "token character hash extraction degraded; continuing",
			"error", extractErr,
			"account_type", accountType)
	} else {
		logs.DebugCtx(ctx, "successfully parsed SSO token claims",
			"character_hash", characterHash,
			"account_type", accountType)
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)

	response := SSOExchangeResponse{
		AccessToken:  tokenResponse.AccessToken,
		RefreshToken: tokenResponse.RefreshToken,
		TokenType:    tokenResponse.TokenType,
		ExpiresIn:    tokenResponse.ExpiresIn,
	}

	if err := json.NewEncoder(w).Encode(response); err != nil {
		duration := time.Since(start)
		m.Errors.WithLabelValues("encode_error").Inc(ctx)
		apimetrics.LogRequestMetrics(ctx, "eve_sso_code_exchange", duration, "encode_error",
			"error", err)
		logs.ErrorCtx(ctx, "failed to encode response", "error", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	// Update metrics
	duration := time.Since(start)
	m.Requests.Observe(ctx, apimetrics.DurationMilliseconds(duration))
	m.RequestsCount.Inc(ctx)
	m.Successes.Inc(ctx)

	accountID := auth.GetAccountIDFromCharacterHash(characterHash)
	apimetrics.LogRequestMetrics(ctx, "eve_sso_code_exchange", duration, "success",
		"account_type", accountType,
		"character_hash", characterHash,
		"account_id", accountID)

	logs.InfoCtx(ctx, "SSO token exchange completed",
		"character_hash", characterHash,
		"account_id", accountID,
		"account_type", accountType,
		"duration_ms", duration.Milliseconds())
}

// SSORefreshHandler handles SSO refresh token requests
func SSORefreshHandler(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	ctx := r.Context()
	start, ok := logs.RequestStartTime(ctx)
	if !ok {
		start = time.Now()
	}
	m := apimetrics.GetAPIEveSSOTokenRefresh()
	cfg, err := config.LoadConfig()
	if err != nil {
		duration := time.Since(start)
		m.Errors.WithLabelValues("config_error").Inc(ctx)
		apimetrics.LogRequestMetrics(ctx, "eve_sso_token_refresh", duration, "config_error", "error", err)
		logs.ErrorCtx(ctx, "failed to load config for SSO refresh", "error", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	// Only allow POST requests
	if r.Method != http.MethodPost {
		duration := time.Since(start)
		m.Errors.WithLabelValues("method_not_allowed").Inc(ctx)
		apimetrics.LogRequestMetrics(ctx, "eve_sso_token_refresh", duration, "method_not_allowed")
		logs.WarnCtx(ctx, "invalid method for SSO refresh endpoint")
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Extract refresh token from request body
	refreshToken, err := extractRefreshTokenFromSSORequest(r)
	if err != nil {
		duration := time.Since(start)
		m.Errors.WithLabelValues("extraction_error").Inc(ctx)
		apimetrics.LogRequestMetrics(ctx, "eve_sso_token_refresh", duration, "extraction_error",
			"error", err)
		logs.WarnCtx(ctx, "failed to extract refresh token from request body", "error", err)
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	// Validate refresh token length (using same constant as refresh.go)
	if len(refreshToken) > maxRefreshTokenLength {
		duration := time.Since(start)
		m.Errors.WithLabelValues("refresh_token_too_long").Inc(ctx)
		apimetrics.LogRequestMetrics(ctx, "eve_sso_token_refresh", duration, "refresh_token_too_long",
			"length", len(refreshToken), "max", maxRefreshTokenLength)
		logs.WarnCtx(ctx, "refresh token too long", "length", len(refreshToken), "max", maxRefreshTokenLength)
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	// Validate client ID and secret are configured
	if cfg.EveSSOClientID == "" || cfg.EveSSOClientSecret == "" {
		duration := time.Since(start)
		m.Errors.WithLabelValues("config_error").Inc(ctx)
		apimetrics.LogRequestMetrics(ctx, "eve_sso_token_refresh", duration, "config_error")
		logs.ErrorCtx(ctx, "EVE SSO client ID or secret not configured")
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	// Refresh access token using refresh token
	tokenResponse, err := refreshAccessToken(ctx, cfg.EveSSOClientID, cfg.EveSSOClientSecret, refreshToken)
	var characterHash string
	if err != nil {
		duration := time.Since(start)
		m.Errors.WithLabelValues("sso_refresh_error").Inc(ctx)
		apimetrics.LogRequestMetrics(ctx, "eve_sso_token_refresh", duration, "sso_refresh_error",
			"error", err)
		logs.WarnCtx(ctx, "failed to refresh access token", "error", err)

		// Return appropriate error based on SSO response
		if strings.Contains(err.Error(), "invalid_grant") || strings.Contains(err.Error(), "invalid_request") {
			http.Error(w, "Invalid refresh token", http.StatusBadRequest)
		} else if strings.Contains(err.Error(), "server error") {
			http.Error(w, "EVE SSO server error", http.StatusBadGateway)
		} else {
			http.Error(w, "Failed to refresh token", http.StatusInternalServerError)
		}
		return
	}

	characterHash, extractErr := extractCharacterHashFromToken(tokenResponse.AccessToken, cfg.EveSSOClientID)
	if extractErr != nil {
		logs.WarnCtx(ctx, "token character hash extraction degraded; continuing", "error", extractErr)
	} else {
		logs.DebugCtx(ctx, "successfully parsed SSO token claims",
			"character_hash", characterHash)
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)

	response := SSORefreshResponse{
		AccessToken:  tokenResponse.AccessToken,
		RefreshToken: tokenResponse.RefreshToken,
		TokenType:    tokenResponse.TokenType,
		ExpiresIn:    tokenResponse.ExpiresIn,
	}

	if err := json.NewEncoder(w).Encode(response); err != nil {
		duration := time.Since(start)
		m.Errors.WithLabelValues("encode_error").Inc(ctx)
		apimetrics.LogRequestMetrics(ctx, "eve_sso_token_refresh", duration, "encode_error",
			"error", err)
		logs.ErrorCtx(ctx, "failed to encode response", "error", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	// Update metrics
	duration := time.Since(start)
	m.Requests.Observe(ctx, apimetrics.DurationMilliseconds(duration))
	m.RequestsCount.Inc(ctx)
	m.Successes.Inc(ctx)
	apimetrics.RecordSSORefreshDistinctCharacter(ctx, clients.Redis, characterHash)

	accountID := auth.GetAccountIDFromCharacterHash(characterHash)
	apimetrics.LogRequestMetrics(ctx, "eve_sso_token_refresh", duration, "success",
		"character_hash", characterHash,
		"account_id", accountID)

	logs.InfoCtx(ctx, "SSO token refresh completed",
		"character_hash", characterHash,
		"account_id", accountID,
		"duration_ms", duration.Milliseconds())
}

// exchangeAuthCodeForToken exchanges an authorization code for an access token
func exchangeAuthCodeForToken(ctx context.Context, clientID, clientSecret, authCode string) (*EveSSOTokenResponse, error) {
	// Create Basic Auth header
	authHeader := base64.StdEncoding.EncodeToString([]byte(clientID + ":" + clientSecret))

	// Prepare form data
	data := url.Values{}
	data.Set("grant_type", "authorization_code")
	data.Set("code", authCode)

	// Create HTTP request
	req, err := http.NewRequestWithContext(ctx, "POST", eveSSOTokenURL, strings.NewReader(data.Encode()))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Authorization", "Basic "+authHeader)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Host", "login.eveonline.com")

	// Make HTTP request
	client := &http.Client{
		Timeout: 30 * time.Second,
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to make request to EVE SSO: %w", err)
	}
	defer resp.Body.Close()

	// Handle no content responses (204)
	if resp.StatusCode == http.StatusNoContent {
		return nil, errors.New("EVE SSO Error: No content received")
	}

	// Read response body
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response body: %w", err)
	}

	// Handle client errors (4xx)
	if resp.StatusCode >= 400 && resp.StatusCode < 500 {
		var errorResp EveSSOErrorResponse
		if err := json.Unmarshal(body, &errorResp); err == nil {
			return nil, fmt.Errorf("EVE SSO Error: %s", errorResp.ErrorDescription)
		}
		return nil, fmt.Errorf("EVE SSO Error: Unknown error (status %d)", resp.StatusCode)
	}

	// Handle server errors (5xx)
	if resp.StatusCode >= 500 {
		var errorResp EveSSOErrorResponse
		if err := json.Unmarshal(body, &errorResp); err == nil {
			return nil, fmt.Errorf("EVE SSO Error: %s", errorResp.ErrorDescription)
		}
		return nil, fmt.Errorf("EVE SSO Error: Server error (status %d)", resp.StatusCode)
	}

	// Parse successful response
	var tokenResp EveSSOTokenResponse
	if err := json.Unmarshal(body, &tokenResp); err != nil {
		return nil, fmt.Errorf("failed to parse token response: %w", err)
	}

	return &tokenResp, nil
}

// refreshAccessToken refreshes an access token using a refresh token
func refreshAccessToken(ctx context.Context, clientID, clientSecret, refreshToken string) (*EveSSOTokenResponse, error) {
	// Create Basic Auth header
	authHeader := base64.StdEncoding.EncodeToString([]byte(clientID + ":" + clientSecret))

	// Prepare form data
	data := url.Values{}
	data.Set("grant_type", "refresh_token")
	data.Set("refresh_token", refreshToken)

	// Create HTTP request
	req, err := http.NewRequestWithContext(ctx, "POST", eveSSOTokenURL, strings.NewReader(data.Encode()))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Authorization", "Basic "+authHeader)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Host", "login.eveonline.com")

	// Make HTTP request
	client := &http.Client{
		Timeout: 30 * time.Second,
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to make request to EVE SSO: %w", err)
	}
	defer resp.Body.Close()

	// Read response body
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response body: %w", err)
	}

	// Handle errors
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		var errorResp EveSSOErrorResponse
		if err := json.Unmarshal(body, &errorResp); err == nil {
			return nil, fmt.Errorf("API request failed with status %d: %s", resp.StatusCode, errorResp.ErrorDescription)
		}
		return nil, fmt.Errorf("API request failed with status %d: %s", resp.StatusCode, resp.Status)
	}

	// Parse successful response
	var tokenResp EveSSOTokenResponse
	if err := json.Unmarshal(body, &tokenResp); err != nil {
		return nil, fmt.Errorf("failed to parse token response: %w", err)
	}

	return &tokenResp, nil
}

// extractCharacterHashFromToken returns character hash only from validated JWT claims.
func extractCharacterHashFromToken(tokenString, clientID string) (string, error) {
	validatedClaims, err := sso.ValidateEveSSOToken(tokenString, clientID)
	if err != nil {
		return "", fmt.Errorf("validated parse failed: %w", err)
	}
	return validatedClaims.Owner, nil
}

// extractAuthCodeFromRequest extracts the authorization code from the request body
func extractAuthCodeFromRequest(r *http.Request) (string, bool, error) {
	// Limit request body size
	r.Body = http.MaxBytesReader(nil, r.Body, maxAuthCodeLength+1024)

	var reqBody SSOExchangeRequest

	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()

	if err := decoder.Decode(&reqBody); err != nil {
		if err == io.EOF {
			return "", false, errors.New("request body is required")
		}
		if strings.Contains(err.Error(), "request body too large") {
			return "", false, errors.New("request body too large")
		}
		return "", false, fmt.Errorf("invalid request body: %w", err)
	}

	// Ensure body was fully consumed
	if _, err := decoder.Token(); err != io.EOF {
		return "", false, errors.New("request body contains extra data")
	}

	if reqBody.AuthCode == "" {
		return "", false, errors.New("auth_code is required in request body")
	}

	authCode := strings.TrimSpace(reqBody.AuthCode)
	if authCode == "" {
		return "", false, errors.New("auth_code cannot be empty")
	}

	return authCode, reqBody.AccountType, nil
}

// extractRefreshTokenFromSSORequest extracts the refresh token from the request body
func extractRefreshTokenFromSSORequest(r *http.Request) (string, error) {
	// Limit request body size (using same constant as refresh.go)
	r.Body = http.MaxBytesReader(nil, r.Body, maxRefreshTokenLength+1024)

	var reqBody SSORefreshRequest

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

	// Ensure body was fully consumed
	if _, err := decoder.Token(); err != io.EOF {
		return "", errors.New("request body contains extra data")
	}

	if reqBody.RefreshToken == "" {
		return "", errors.New("refresh_token is required in request body")
	}

	refreshToken := strings.TrimSpace(reqBody.RefreshToken)
	if refreshToken == "" {
		return "", errors.New("refresh_token cannot be empty")
	}

	return refreshToken, nil
}
