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

	"eve-industry-planner/api/api/helper/sso"
	"eve-industry-planner/shared/core/config"
	"eve-industry-planner/shared/shared"
	"eve-industry-planner/shared/shared/logs"
	"eve-industry-planner/shared/shared/metrics"
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
	start := time.Now()
	m := metrics.GetAPISSOExchange()
	cfg, err := config.LoadConfig()
	if err != nil {
		http.Error(w, "Configuration error: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Set context timeout
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	// Only allow POST requests
	if r.Method != http.MethodPost {
		duration := time.Since(start)
		m.Errors.WithLabelValues("method_not_allowed").Inc()
		metrics.LogRequestMetrics("sso_exchange", duration, "method_not_allowed",
			"method", r.Method, "ip", r.RemoteAddr)
		logs.WarnCtx(ctx, "invalid method for SSO exchange endpoint", "method", r.Method, "ip", r.RemoteAddr)
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Extract authorization code from request body
	authCode, accountType, err := extractAuthCodeFromRequest(r)
	if err != nil {
		duration := time.Since(start)
		m.Errors.WithLabelValues("extraction_error").Inc()
		metrics.LogRequestMetrics("sso_exchange", duration, "extraction_error",
			"error", err, "ip", r.RemoteAddr)
		logs.WarnCtx(ctx, "failed to extract auth code from request body", "error", err, "ip", r.RemoteAddr)
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	// Validate auth code length
	if len(authCode) > maxAuthCodeLength {
		duration := time.Since(start)
		m.Errors.WithLabelValues("auth_code_too_long").Inc()
		metrics.LogRequestMetrics("sso_exchange", duration, "auth_code_too_long",
			"length", len(authCode), "max", maxAuthCodeLength, "ip", r.RemoteAddr)
		logs.WarnCtx(ctx, "auth code too long", "length", len(authCode), "max", maxAuthCodeLength, "ip", r.RemoteAddr)
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	// Validate client ID and secret are configured
	if cfg.EveSSOClientID == "" || cfg.EveSSOClientSecret == "" {
		duration := time.Since(start)
		m.Errors.WithLabelValues("config_error").Inc()
		metrics.LogRequestMetrics("sso_exchange", duration, "config_error",
			"ip", r.RemoteAddr)
		logs.ErrorCtx(ctx, "EVE SSO client ID or secret not configured", "ip", r.RemoteAddr)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	// Exchange authorization code for access token
	tokenResponse, err := exchangeAuthCodeForToken(ctx, cfg.EveSSOClientID, cfg.EveSSOClientSecret, authCode)
	var characterHash string
	if err != nil {
		duration := time.Since(start)
		m.Errors.WithLabelValues("sso_exchange_error").Inc()
		metrics.LogRequestMetrics("sso_exchange", duration, "sso_exchange_error",
			"error", err, "ip", r.RemoteAddr)
		logs.WarnCtx(ctx, "failed to exchange auth code for token", "error", err, "ip", r.RemoteAddr)

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
		m.Errors.WithLabelValues("no_access_token").Inc()
		metrics.LogRequestMetrics("sso_exchange", duration, "no_access_token",
			"ip", r.RemoteAddr)
		logs.WarnCtx(ctx, "no access token received from EVE SSO", "ip", r.RemoteAddr)
		http.Error(w, "No access token received from EVE SSO", http.StatusInternalServerError)
		return
	}

	// Decode JWT token to extract claims (without validation, just decode like JS decodeJwt)
	decodedClaims, err := decodeJWTWithoutValidation(tokenResponse.AccessToken)
	if err != nil {
		// If decoding fails, validate the token to ensure it's legitimate before returning it
		logs.WarnCtx(ctx, "failed to decode JWT token without validation, attempting full validation", "error", err, "ip", r.RemoteAddr)
		validatedClaims, validateErr := sso.ValidateEveSSOToken(tokenResponse.AccessToken, cfg.EveSSOClientID)
		if validateErr != nil {
			duration := time.Since(start)
			m.Errors.WithLabelValues("token_validation_error").Inc()
			metrics.LogRequestMetrics("sso_exchange", duration, "token_validation_error",
				"error", validateErr, "decode_error", err, "ip", r.RemoteAddr)
			logs.ErrorCtx(ctx, "failed to validate token after decode failure", "decode_error", err, "validation_error", validateErr, "ip", r.RemoteAddr)
			http.Error(w, "Invalid token received from EVE SSO", http.StatusInternalServerError)
			return
		}
		// Use validated claims
		decodedClaims = validatedClaims
		characterHash = validatedClaims.Owner
		logs.DebugCtx(ctx, "token validated successfully after decode failure",
			"character_id", validatedClaims.CharacterID,
			"character_hash", characterHash,
			"account_type", accountType,
			"ip", r.RemoteAddr)
	} else {
		// Extract character hash from the Owner field
		characterHash = decodedClaims.Owner
		// Log successful exchange (debug level for detailed info)
		logs.DebugCtx(ctx, "successfully decoded JWT token",
			"character_id", decodedClaims.CharacterID,
			"character_hash", characterHash,
			"account_type", accountType,
			"ip", r.RemoteAddr)
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
		m.Errors.WithLabelValues("encode_error").Inc()
		metrics.LogRequestMetrics("sso_exchange", duration, "encode_error",
			"error", err, "ip", r.RemoteAddr)
		logs.ErrorCtx(ctx, "failed to encode response", "error", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	// Update metrics
	duration := time.Since(start)
	m.Requests.Observe(duration.Seconds())
	m.RequestsCount.Inc()
	m.Successes.Inc()

	metrics.LogRequestMetrics("sso_exchange", duration, "success",
		"account_type", accountType,
		"character_hash", characterHash,
		"ip", r.RemoteAddr)

	logs.InfoCtx(ctx, "SSO token exchange completed",
		"character_hash", characterHash,
		"duration_ms", duration.Milliseconds(),
		"ip", r.RemoteAddr)
}

// SSORefreshHandler handles SSO refresh token requests
func SSORefreshHandler(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	start := time.Now()
	m := metrics.GetAPISSORefresh()
	cfg, err := config.LoadConfig()
	if err != nil {
		http.Error(w, "Configuration error: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Set context timeout
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	// Only allow POST requests
	if r.Method != http.MethodPost {
		duration := time.Since(start)
		m.Errors.WithLabelValues("method_not_allowed").Inc()
		metrics.LogRequestMetrics("sso_refresh", duration, "method_not_allowed",
			"method", r.Method, "ip", r.RemoteAddr)
		logs.WarnCtx(ctx, "invalid method for SSO refresh endpoint", "method", r.Method, "ip", r.RemoteAddr)
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Extract refresh token from request body
	refreshToken, err := extractRefreshTokenFromSSORequest(r)
	if err != nil {
		duration := time.Since(start)
		m.Errors.WithLabelValues("extraction_error").Inc()
		metrics.LogRequestMetrics("sso_refresh", duration, "extraction_error",
			"error", err, "ip", r.RemoteAddr)
		logs.WarnCtx(ctx, "failed to extract refresh token from request body", "error", err, "ip", r.RemoteAddr)
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	// Validate refresh token length (using same constant as refresh.go)
	if len(refreshToken) > maxRefreshTokenLength {
		duration := time.Since(start)
		m.Errors.WithLabelValues("refresh_token_too_long").Inc()
		metrics.LogRequestMetrics("sso_refresh", duration, "refresh_token_too_long",
			"length", len(refreshToken), "max", maxRefreshTokenLength, "ip", r.RemoteAddr)
		logs.WarnCtx(ctx, "refresh token too long", "length", len(refreshToken), "max", maxRefreshTokenLength, "ip", r.RemoteAddr)
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	// Validate client ID and secret are configured
	if cfg.EveSSOClientID == "" || cfg.EveSSOClientSecret == "" {
		duration := time.Since(start)
		m.Errors.WithLabelValues("config_error").Inc()
		metrics.LogRequestMetrics("sso_refresh", duration, "config_error",
			"ip", r.RemoteAddr)
		logs.ErrorCtx(ctx, "EVE SSO client ID or secret not configured", "ip", r.RemoteAddr)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	// Refresh access token using refresh token
	tokenResponse, err := refreshAccessToken(ctx, cfg.EveSSOClientID, cfg.EveSSOClientSecret, refreshToken)
	var characterHash string
	if err != nil {
		duration := time.Since(start)
		m.Errors.WithLabelValues("sso_refresh_error").Inc()
		metrics.LogRequestMetrics("sso_refresh", duration, "sso_refresh_error",
			"error", err, "ip", r.RemoteAddr)
		logs.WarnCtx(ctx, "failed to refresh access token", "error", err, "ip", r.RemoteAddr)

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

	// Decode JWT token to extract character hash for logging
	decodedClaims, err := decodeJWTWithoutValidation(tokenResponse.AccessToken)
	if err != nil {
		// If decoding fails, validate the token to ensure it's legitimate before returning it
		logs.WarnCtx(ctx, "failed to decode JWT token without validation, attempting full validation", "error", err, "ip", r.RemoteAddr)
		validatedClaims, validateErr := sso.ValidateEveSSOToken(tokenResponse.AccessToken, cfg.EveSSOClientID)
		if validateErr != nil {
			duration := time.Since(start)
			m.Errors.WithLabelValues("token_validation_error").Inc()
			metrics.LogRequestMetrics("sso_refresh", duration, "token_validation_error",
				"error", validateErr, "decode_error", err, "ip", r.RemoteAddr)
			logs.ErrorCtx(ctx, "failed to validate token after decode failure", "decode_error", err, "validation_error", validateErr, "ip", r.RemoteAddr)
			http.Error(w, "Invalid token received from EVE SSO", http.StatusInternalServerError)
			return
		}
		// Use validated claims
		decodedClaims = validatedClaims
		characterHash = validatedClaims.Owner
		logs.DebugCtx(ctx, "token validated successfully after decode failure",
			"character_id", validatedClaims.CharacterID,
			"character_hash", characterHash,
			"ip", r.RemoteAddr)
	} else {
		// Extract character hash from the Owner field
		characterHash = decodedClaims.Owner
		logs.DebugCtx(ctx, "successfully decoded JWT token",
			"character_id", decodedClaims.CharacterID,
			"character_hash", characterHash,
			"ip", r.RemoteAddr)
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
		m.Errors.WithLabelValues("encode_error").Inc()
		metrics.LogRequestMetrics("sso_refresh", duration, "encode_error",
			"error", err, "ip", r.RemoteAddr)
		logs.ErrorCtx(ctx, "failed to encode response", "error", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	// Update metrics
	duration := time.Since(start)
	m.Requests.Observe(duration.Seconds())
	m.RequestsCount.Inc()
	m.Successes.Inc()

	metrics.LogRequestMetrics("sso_refresh", duration, "success",
		"character_hash", characterHash,
		"ip", r.RemoteAddr)

	logs.InfoCtx(ctx, "SSO token refresh completed",
		"character_hash", characterHash,
		"duration_ms", duration.Milliseconds(),
		"ip", r.RemoteAddr)
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

// decodeJWTWithoutValidation decodes a JWT token without validation (like JS decodeJwt)
// Returns the decoded claims or nil if decoding fails
func decodeJWTWithoutValidation(tokenString string) (*sso.EveSSOClaims, error) {
	// Split token into parts
	parts := strings.Split(tokenString, ".")
	if len(parts) != 3 {
		return nil, errors.New("invalid JWT format")
	}

	// Decode the payload (second part)
	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return nil, fmt.Errorf("failed to decode JWT payload: %w", err)
	}

	// Unmarshal into claims
	var claims sso.EveSSOClaims
	if err := json.Unmarshal(payload, &claims); err != nil {
		return nil, fmt.Errorf("failed to unmarshal JWT claims: %w", err)
	}

	// Extract character ID from subject
	claims.CharacterID = sso.ExtractCharacterID(claims.Subject)

	return &claims, nil
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
