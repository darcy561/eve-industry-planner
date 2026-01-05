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
	"eve-industry-planner/shared/core/mongo"
	"eve-industry-planner/shared/shared"
	"eve-industry-planner/shared/shared/logs"
	"eve-industry-planner/shared/shared/metrics"
	"time"
)

const (
	maxTokenLength = 8192 // Maximum EVE SSO token length in bytes (8KB). No official JWT max in RFC 7519,
	// but this is a common defensive limit. EVE SSO tokens are typically ~1-2KB.
	maxRefreshTokenLength = 512 // Maximum refresh token length in bytes (UUID format is 36 chars, but allow buffer)
)

// AuthResponse represents the response sent to the client
type AuthResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresAt    int64  `json:"expires_at"` // Unix timestamp (seconds since epoch)
	FirstLogin   bool   `json:"first_login"`
}

func AuthHandler(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	start := time.Now()
	m := metrics.GetAPIAuthLogin()
	cfg := config.LoadConfig()

	// Only allow POST requests
	if r.Method != http.MethodPost {
		duration := time.Since(start)
		m.Errors.WithLabelValues("method_not_allowed").Inc()
		metrics.LogRequestMetrics("auth_login", duration, "method_not_allowed",
			"method", r.Method, "ip", r.RemoteAddr)
		logs.WarnCtx(r.Context(), "invalid method for auth endpoint", "method", r.Method, "ip", r.RemoteAddr)
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Extract token from request body (POST-only, tokens in body for security)
	tokenString, err := extractTokenFromRequest(r)
	if err != nil {
		duration := time.Since(start)
		m.Errors.WithLabelValues("extraction_error").Inc()
		metrics.LogRequestMetrics("auth_login", duration, "extraction_error",
			"error", err, "ip", r.RemoteAddr)
		logs.WarnCtx(r.Context(), "failed to extract token from request body", "error", err, "ip", r.RemoteAddr)
		// Generic error message to avoid leaking information
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	// Validate token length to prevent DoS attacks
	if len(tokenString) > maxTokenLength {
		duration := time.Since(start)
		m.Errors.WithLabelValues("token_too_long").Inc()
		metrics.LogRequestMetrics("auth_login", duration, "token_too_long",
			"length", len(tokenString), "max", maxTokenLength, "ip", r.RemoteAddr)
		logs.WarnCtx(r.Context(), "token too long", "length", len(tokenString), "max", maxTokenLength, "ip", r.RemoteAddr)
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	// Validate the EVE SSO token and extract character hash
	tokenInfo, err := auth.ValidateEveTokenAndExtractHash(tokenString, cfg.EveSSOClientID, r.RemoteAddr)
	if err != nil {
		duration := time.Since(start)
		m.Errors.WithLabelValues("validation_error").Inc()
		metrics.LogRequestMetrics("auth_login", duration, "validation_error",
			"error", err, "ip", r.RemoteAddr)
		http.Error(w, auth.GetEveTokenErrorMessage(err), http.StatusUnauthorized)
		return
	}
	characterHash := tokenInfo.CharacterHash
	scopes := tokenInfo.Scopes

	// Load or get cached RSA private key for JWT signing
	// Loading priority: 1) Persistent file, 2) Environment variable, 3) Auto-generate new key
	cachedKey, err := auth.GetOrLoadPrivateKey()
	if err != nil {
		duration := time.Since(start)
		m.Errors.WithLabelValues("key_load_error").Inc()
		metrics.LogRequestMetrics("auth_login", duration, "key_load_error",
			"error", err, "ip", r.RemoteAddr)
		logs.ErrorCtx(r.Context(), "failed to load RSA private key for JWT signing", "error", err, "ip", r.RemoteAddr)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	// Extract AccountID from character hash (same logic as GenerateInternalJWT)
	// This will be used to load and store corporations for the account
	accountID := auth.GetAccountIDFromCharacterHash(characterHash)

	// Load corporations from Redis if available (keyed by AccountID)
	corporations := auth.GetCorporations(r.Context(), clients.Redis, accountID)

	// Generate our internal JWT token using RS256 (RSA signature)
	// Token expires in 20 minutes, includes corporations if available
	internalToken, internalClaims, err := auth.GenerateInternalJWT(
		cachedKey.Key,
		characterHash,
		cachedKey.Kid,
		corporations,
	)
	if err != nil {
		duration := time.Since(start)
		m.Errors.WithLabelValues("jwt_generation_error").Inc()
		metrics.LogRequestMetrics("auth_login", duration, "jwt_generation_error",
			"error", err, "character_hash", characterHash, "ip", r.RemoteAddr)
		logs.ErrorCtx(r.Context(), "failed to generate internal JWT", "error", err, "character_hash", characterHash, "ip", r.RemoteAddr)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	// Generate refresh token
	refreshToken, err := auth.GenerateRefreshToken()
	if err != nil {
		duration := time.Since(start)
		m.Errors.WithLabelValues("refresh_token_generation_error").Inc()
		metrics.LogRequestMetrics("auth_login", duration, "refresh_token_generation_error",
			"error", err, "character_hash", characterHash, "ip", r.RemoteAddr)
		logs.ErrorCtx(r.Context(), "failed to generate refresh token", "error", err, "character_hash", characterHash, "ip", r.RemoteAddr)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	// Store refresh token in Redis with user data (including corporations)
	refreshTokenData := auth.RefreshTokenData{
		CharacterHash: characterHash,
		AccountID:     internalClaims.AccountID,
		Scopes:        scopes,
		Corporations:  corporations,
	}
	if err := auth.StoreRefreshToken(r.Context(), clients.Redis, refreshToken, refreshTokenData); err != nil {
		duration := time.Since(start)
		m.Errors.WithLabelValues("redis_error").Inc()
		metrics.LogRequestMetrics("auth_login", duration, "redis_error",
			"error", err, "character_hash", characterHash, "ip", r.RemoteAddr)
		logs.ErrorCtx(r.Context(), "failed to store refresh token", "error", err, "character_hash", characterHash, "ip", r.RemoteAddr)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	// Checks if the user document exists, if not creates it with default values
	firstLogin, err := mongo.EnsureUserAccountDocument(r.Context(), clients.Mongo, accountID)
	if err != nil {
		duration := time.Since(start)
		m.Errors.WithLabelValues("mongo_error").Inc()
		metrics.LogRequestMetrics("auth_login", duration, "mongo_error",
			"error", err, "account_id", accountID, "ip", r.RemoteAddr)
		logs.ErrorCtx(r.Context(), "failed to ensure user document exists", "error", err, "account_id", accountID)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)

	// Return the internal JWT token and refresh token
	// Calculate expiration timestamp using the same duration as token generation (Unix timestamp in seconds)
	expiresAt := time.Now().Add(auth.TokenExpirationDuration).Unix()

	response := AuthResponse{
		AccessToken:  internalToken,
		RefreshToken: refreshToken,
		ExpiresAt:    expiresAt,
		FirstLogin:   firstLogin,
	}

	if err := json.NewEncoder(w).Encode(response); err != nil {
		duration := time.Since(start)
		m.Errors.WithLabelValues("encode_error").Inc()
		metrics.LogRequestMetrics("auth_login", duration, "encode_error",
			"error", err, "ip", r.RemoteAddr)
		logs.ErrorCtx(r.Context(), "failed to encode response", "error", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	// Update metrics
	duration := time.Since(start)
	m.Requests.Observe(duration.Seconds())
	m.RequestsCount.Inc()
	m.Successes.Inc()

	// Log per-request metrics for slow requests
	metrics.LogRequestMetrics("auth_login", duration, "success",
		"account_id", accountID,
		"first_login", firstLogin,
		"ip", r.RemoteAddr,
	)

	logs.InfoCtx(r.Context(), "successfully authenticated user",
		"character_hash", characterHash,
		"duration_ms", duration.Milliseconds(),
		"ip", r.RemoteAddr,
	)
}

// extractTokenFromRequest extracts the JWT token from the request body
// We use POST with body (not GET with header) to avoid tokens appearing in logs/URLs
// Implements security measures: body size limits and input validation
func extractTokenFromRequest(r *http.Request) (string, error) {
	// Limit request body size to prevent DoS attacks
	// Add buffer for JSON structure (maxTokenLength + JSON overhead)
	r.Body = http.MaxBytesReader(nil, r.Body, maxTokenLength+1024)

	var reqBody struct {
		Token string `json:"token"`
	}

	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields() // Reject requests with unexpected fields

	if err := decoder.Decode(&reqBody); err != nil {
		if err == io.EOF {
			return "", errors.New("request body is required")
		}
		// Check for body size exceeded error
		if strings.Contains(err.Error(), "request body too large") {
			return "", errors.New("request body too large")
		}
		return "", fmt.Errorf("invalid request body: %w", err)
	}

	// Ensure body was fully consumed (prevents extra data attacks)
	if _, err := decoder.Token(); err != io.EOF {
		return "", errors.New("request body contains extra data")
	}

	if reqBody.Token == "" {
		return "", errors.New("token is required in request body")
	}

	tokenString := strings.TrimSpace(reqBody.Token)
	if tokenString == "" {
		return "", errors.New("token cannot be empty")
	}

	return tokenString, nil
}
