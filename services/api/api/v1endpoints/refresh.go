package v1endpoints

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"

	"eve-industry-planner/api/api/helper/auth"
	"eve-industry-planner/shared/core/config"
	"eve-industry-planner/shared/shared"
	"eve-industry-planner/shared/shared/logs"
	"eve-industry-planner/shared/shared/metrics"
	"time"
)

// RefreshRequest represents the request body for token refresh
type RefreshRequest struct {
	RefreshToken string `json:"refresh_token"`
	EveToken     string `json:"eve_token"` // EVE SSO token - must match the one stored with refresh token
}

// RefreshResponse represents the response sent to the client
type RefreshResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresAt    int64  `json:"expires_at"` // Unix timestamp (seconds since epoch)
}

// RefreshHandler handles token refresh requests
func RefreshHandler(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	start := time.Now()
	m := metrics.GetAPIAuthRefresh()

	// Only allow POST requests
	if r.Method != http.MethodPost {
		m.Errors.WithLabelValues("method_not_allowed").Inc()
		logs.WarnCtx(r.Context(), "invalid method for refresh endpoint", "method", r.Method, "ip", r.RemoteAddr)
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Extract refresh token and EVE token from request body
	refreshToken, eveToken, err := extractRefreshTokenFromRequest(r)
	if err != nil {
		m.Errors.WithLabelValues("extraction_error").Inc()
		logs.WarnCtx(r.Context(), "failed to extract tokens from request body", "error", err, "ip", r.RemoteAddr)
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	// Validate refresh token length to prevent DoS attacks
	if len(refreshToken) > maxRefreshTokenLength {
		m.Errors.WithLabelValues("refresh_token_too_long").Inc()
		logs.WarnCtx(r.Context(), "refresh token too long", "length", len(refreshToken), "max", maxRefreshTokenLength, "ip", r.RemoteAddr)
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	// Validate EVE token length to prevent DoS attacks
	if len(eveToken) > maxTokenLength {
		m.Errors.WithLabelValues("eve_token_too_long").Inc()
		logs.WarnCtx(r.Context(), "EVE token too long", "length", len(eveToken), "max", maxTokenLength, "ip", r.RemoteAddr)
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	// Get refresh token data from Redis first to get stored character hash
	tokenData, err := auth.GetRefreshTokenData(r.Context(), clients.Redis, refreshToken)
	if err != nil {
		m.Errors.WithLabelValues("refresh_token_not_found").Inc()
		logs.WarnCtx(r.Context(), "invalid or expired refresh token", "error", err, "ip", r.RemoteAddr)
		http.Error(w, "Invalid token", http.StatusUnauthorized)
		return
	}

	// Validate the EVE SSO token and extract the owner field (character hash)
	cfg := config.LoadConfig()
	eveTokenInfo, err := auth.ValidateEveTokenAndExtractHash(eveToken, cfg.EveSSOClientID, r.RemoteAddr)
	if err != nil {
		m.Errors.WithLabelValues("validation_error").Inc()
		http.Error(w, auth.GetEveTokenErrorMessage(err), http.StatusUnauthorized)
		return
	}

	// Verify the EVE token's owner field (character hash) matches the one stored with refresh token
	if tokenData.CharacterHash != eveTokenInfo.CharacterHash {
		m.Errors.WithLabelValues("character_hash_mismatch").Inc()
		logs.WarnCtx(r.Context(), "EVE token owner field (character hash) does not match refresh token", "eve_hash", eveTokenInfo.CharacterHash, "stored_hash", tokenData.CharacterHash, "ip", r.RemoteAddr)
		http.Error(w, "Invalid token", http.StatusUnauthorized)
		return
	}

	// Load or get cached RSA private key for JWT signing
	cachedKey, err := auth.GetOrLoadPrivateKey()
	if err != nil {
		m.Errors.WithLabelValues("key_load_error").Inc()
		logs.ErrorCtx(r.Context(), "failed to load RSA private key for JWT signing", "error", err, "ip", r.RemoteAddr)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	// Always load corporations from Redis (keyed by AccountID)
	// Corporations are stored by AccountID (aggregated from all characters)
	corporations := auth.GetCorporations(r.Context(), clients.Redis, tokenData.AccountID)

	// Generate new access token with stored user data and corporations
	internalToken, _, err := auth.GenerateInternalJWT(
		cachedKey.Key,
		tokenData.CharacterHash,
		cachedKey.Kid,
		corporations,
	)
	if err != nil {
		m.Errors.WithLabelValues("jwt_generation_error").Inc()
		logs.ErrorCtx(r.Context(), "failed to generate internal JWT", "error", err, "character_hash", tokenData.CharacterHash, "ip", r.RemoteAddr)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	// Generate new refresh token (rotate refresh token for security)
	newRefreshToken, err := auth.GenerateRefreshToken()
	if err != nil {
		m.Errors.WithLabelValues("refresh_token_generation_error").Inc()
		logs.ErrorCtx(r.Context(), "failed to generate new refresh token", "error", err, "character_hash", tokenData.CharacterHash, "ip", r.RemoteAddr)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	// Update token data with fresh corporations from Redis
	updatedTokenData := *tokenData
	updatedTokenData.Corporations = auth.CorporationIDs(corporations)

	// Store new refresh token in Redis with updated user data
	if err := auth.StoreRefreshToken(r.Context(), clients.Redis, newRefreshToken, updatedTokenData); err != nil {
		m.Errors.WithLabelValues("redis_error").Inc()
		logs.ErrorCtx(r.Context(), "failed to store new refresh token", "error", err, "character_hash", tokenData.CharacterHash, "ip", r.RemoteAddr)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	// Revoke old refresh token (token rotation)
	if err := auth.RevokeRefreshToken(r.Context(), clients.Redis, refreshToken); err != nil {
		// Log but don't fail - old token will expire naturally
		logs.WarnCtx(r.Context(), "failed to revoke old refresh token", "error", err, "character_hash", tokenData.CharacterHash)
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)

	// Return new access token and new refresh token
	// Calculate expiration timestamp using the same duration as token generation (Unix timestamp in seconds)
	expiresAt := time.Now().Add(auth.TokenExpirationDuration).Unix()

	response := RefreshResponse{
		AccessToken:  internalToken,
		RefreshToken: newRefreshToken,
		ExpiresAt:    expiresAt,
	}

	if err := json.NewEncoder(w).Encode(response); err != nil {
		m.Errors.WithLabelValues("encode_error").Inc()
		logs.ErrorCtx(r.Context(), "failed to encode response", "error", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	// Update metrics
	duration := time.Since(start)
	m.Requests.Observe(duration.Seconds())
	m.RequestsCount.Inc()
	m.Successes.Inc()

	logs.InfoCtx(r.Context(), "successfully refreshed token",
		"character_hash", tokenData.CharacterHash,
		"duration_ms", duration.Milliseconds(),
		"ip", r.RemoteAddr,
	)
}

// extractRefreshTokenFromRequest extracts the refresh token and EVE token from the request body
// We use POST with body (not GET with header) to avoid tokens appearing in logs/URLs
// Implements security measures: body size limits and input validation
func extractRefreshTokenFromRequest(r *http.Request) (string, string, error) {
	// Limit request body size to prevent DoS attacks
	// Refresh token (max 512) + EVE token (max 8192) + JSON overhead
	r.Body = http.MaxBytesReader(nil, r.Body, maxRefreshTokenLength+maxTokenLength+1024)

	var reqBody RefreshRequest

	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()

	if err := decoder.Decode(&reqBody); err != nil {
		if err == io.EOF {
			return "", "", errors.New("request body is required")
		}
		if strings.Contains(err.Error(), "request body too large") {
			return "", "", errors.New("request body too large")
		}
		return "", "", fmt.Errorf("invalid request body: %w", err)
	}

	// Ensure body was fully consumed
	if _, err := decoder.Token(); err != io.EOF {
		return "", "", errors.New("request body contains extra data")
	}

	if reqBody.RefreshToken == "" {
		return "", "", errors.New("refresh_token is required in request body")
	}

	if reqBody.EveToken == "" {
		return "", "", errors.New("eve_token is required in request body")
	}

	refreshToken := strings.TrimSpace(reqBody.RefreshToken)
	if refreshToken == "" {
		return "", "", errors.New("refresh_token cannot be empty")
	}

	eveToken := strings.TrimSpace(reqBody.EveToken)
	if eveToken == "" {
		return "", "", errors.New("eve_token cannot be empty")
	}

	return refreshToken, eveToken, nil
}
