package v1endpoints

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"eve-industry-planner/api/helper/auth"
	"eve-industry-planner/api/migration"
	"eve-industry-planner/shared/core/config"
	"eve-industry-planner/shared/core/mongo"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/shared"
	"eve-industry-planner/shared/telemetry/apimetrics"
)

const (
	maxTokenLength = 8192 // Maximum EVE SSO token length in bytes (8KB). No official JWT max in RFC 7519,
	// but this is a common defensive limit. EVE SSO tokens are typically ~1-2KB.
	maxRefreshTokenLength = 512 // Maximum refresh token length in bytes (UUID format is 36 chars, but allow buffer)
)

// AuthResponse represents the response sent to the client
type AuthResponse struct {
	AccessToken        string `json:"access_token"`
	RefreshToken       string `json:"refresh_token"`
	ExpiresAt          int64  `json:"expires_at"` // Unix timestamp (seconds since epoch)
	FirstLogin         bool   `json:"first_login"`
	FirebaseToken      string `json:"firebase_token"`       // Firebase custom token for sign-in (avoids extra request)
	FirebaseFirstLogin bool   `json:"firebase_first_login"` // Whether user was new in Firebase Auth
}

func AuthHandler(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	ctx := r.Context()
	start, ok := logs.RequestStartTime(ctx)
	if !ok {
		start = time.Now()
	}
	m := apimetrics.GetAPIEveTokenLogin()
	cfg, err := config.LoadConfig()
	if err != nil {
		http.Error(w, "Configuration error: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Only allow POST requests
	if r.Method != http.MethodPost {
		duration := time.Since(start)
		m.Errors.WithLabelValues("method_not_allowed").Inc(ctx)
		apimetrics.LogRequestMetrics(ctx, "eve_token_login", duration, "method_not_allowed")
		logs.WarnCtx(ctx, "invalid method for auth endpoint")
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Extract token from request body (POST-only, tokens in body for security)
	tokenString, err := extractTokenFromRequest(r)
	if err != nil {
		duration := time.Since(start)
		m.Errors.WithLabelValues("extraction_error").Inc(ctx)
		apimetrics.LogRequestMetrics(ctx, "eve_token_login", duration, "extraction_error",
			"error", err)
		logs.WarnCtx(ctx, "failed to extract token from request body", "error", err)
		// Generic error message to avoid leaking information
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	// Validate token length to prevent DoS attacks
	if len(tokenString) > maxTokenLength {
		duration := time.Since(start)
		m.Errors.WithLabelValues("token_too_long").Inc(ctx)
		apimetrics.LogRequestMetrics(ctx, "eve_token_login", duration, "token_too_long",
			"length", len(tokenString), "max", maxTokenLength)
		logs.WarnCtx(ctx, "token too long", "length", len(tokenString), "max", maxTokenLength)
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	// Validate the EVE SSO token and extract character hash
	tokenInfo, err := auth.ValidateEveTokenAndExtractHash(r.Context(), tokenString, cfg.EveSSOClientID)
	if err != nil {
		duration := time.Since(start)
		contentType := r.Header.Get("Content-Type")
		m.Errors.WithLabelValues("validation_error").Inc(ctx)
		apimetrics.LogRequestMetrics(ctx, "eve_token_login", duration, "validation_error",
			"error", err,
			"token_length", len(tokenString),
			"content_type", contentType,
		)
		// Do not log raw token; length + error are enough for support and Grafana.
		logs.WarnCtx(ctx, "EVE SSO token validation failed",
			"error", err,
			"token_length", len(tokenString),
			"content_type", contentType,
		)
		http.Error(w, auth.GetEveTokenErrorMessage(err), http.StatusUnauthorized)
		return
	}
	characterHash := tokenInfo.CharacterHash
	scopes := tokenInfo.Scopes
	accountID := auth.GetAccountIDFromCharacterHash(characterHash)

	// Load or get cached RSA private key for JWT signing
	// Loading priority: 1) Persistent file, 2) Environment variable, 3) Auto-generate new key
	cachedKey, err := auth.GetOrLoadPrivateKey()
	if err != nil {
		duration := time.Since(start)
		m.Errors.WithLabelValues("key_load_error").Inc(ctx)
		apimetrics.LogRequestMetrics(ctx, "eve_token_login", duration, "key_load_error",
			"error", err, "account_id", accountID)
		logs.ErrorCtx(ctx, "failed to load RSA private key for JWT signing", "error", err, "account_id", accountID)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	// Load corporations from Redis if available (keyed by AccountID)
	corporations := auth.GetCorporations(ctx, clients.Redis, accountID)

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
		m.Errors.WithLabelValues("jwt_generation_error").Inc(ctx)
		apimetrics.LogRequestMetrics(ctx, "eve_token_login", duration, "jwt_generation_error",
			"error", err, "account_id", accountID, "character_hash", characterHash)
		logs.ErrorCtx(ctx, "failed to generate internal JWT", "error", err, "account_id", accountID, "character_hash", characterHash)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	// Generate refresh token
	refreshToken, err := auth.GenerateRefreshToken()
	if err != nil {
		duration := time.Since(start)
		m.Errors.WithLabelValues("refresh_token_generation_error").Inc(ctx)
		apimetrics.LogRequestMetrics(ctx, "eve_token_login", duration, "refresh_token_generation_error",
			"error", err, "account_id", accountID, "character_hash", characterHash)
		logs.ErrorCtx(ctx, "failed to generate refresh token", "error", err, "account_id", accountID, "character_hash", characterHash)
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
	if err := auth.StoreRefreshToken(ctx, clients.Redis, refreshToken, refreshTokenData); err != nil {
		duration := time.Since(start)
		m.Errors.WithLabelValues("redis_error").Inc(ctx)
		apimetrics.LogRequestMetrics(ctx, "eve_token_login", duration, "redis_error",
			"error", err, "account_id", accountID, "character_hash", characterHash)
		logs.ErrorCtx(ctx, "failed to store refresh token", "error", err, "account_id", accountID, "character_hash", characterHash)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	// Checks if the user document exists, if not creates it with default values
	firstLogin, err := mongo.EnsureUserAccountDocument(ctx, clients.Mongo, accountID)
	if err != nil {
		duration := time.Since(start)
		m.Errors.WithLabelValues("mongo_error").Inc(ctx)
		apimetrics.LogRequestMetrics(ctx, "eve_token_login", duration, "mongo_error",
			"error", err, "account_id", accountID)
		logs.ErrorCtx(ctx, "failed to ensure user document exists", "error", err, "account_id", accountID)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)

	// Generate Firebase custom token in the same request so the frontend can sign in without a second call
	firebaseToken, firebaseFirstLogin, err := migration.GenerateFirebaseCustomToken(ctx, accountID)
	if err != nil {
		duration := time.Since(start)
		m.Errors.WithLabelValues("firebase_token_error").Inc(ctx)
		apimetrics.LogRequestMetrics(ctx, "eve_token_login", duration, "firebase_token_error",
			"error", err, "account_id", accountID)
		logs.ErrorCtx(ctx, "failed to generate firebase custom token", "error", err, "account_id", accountID)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	migration.EnqueueMigrateUserDocumentToMongo(ctx, clients.JetStream, accountID, clients.NATS)
	logs.InfoCtx(ctx, "enqueued migrate user document to mongo task", "account_id", accountID)

	// Return the internal JWT token, refresh token, and Firebase token
	// Calculate expiration timestamp using the same duration as token generation (Unix timestamp in seconds)
	expiresAt := time.Now().Add(auth.TokenExpirationDuration).Unix()

	response := AuthResponse{
		AccessToken:        internalToken,
		RefreshToken:       refreshToken,
		ExpiresAt:          expiresAt,
		FirstLogin:         firstLogin,
		FirebaseToken:      firebaseToken,
		FirebaseFirstLogin: firebaseFirstLogin,
	}

	if err := json.NewEncoder(w).Encode(response); err != nil {
		duration := time.Since(start)
		m.Errors.WithLabelValues("encode_error").Inc(ctx)
		apimetrics.LogRequestMetrics(ctx, "eve_token_login", duration, "encode_error",
			"error", err, "account_id", accountID)
		logs.ErrorCtx(ctx, "failed to encode response", "error", err, "account_id", accountID)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	// Update metrics
	duration := time.Since(start)
	m.Requests.Observe(ctx, apimetrics.DurationMilliseconds(duration))
	m.RequestsCount.Inc(ctx)
	m.Successes.Inc(ctx)
	if firstLogin {
		m.NewUsers.Inc(ctx)
	}

	// Log per-request metrics for slow requests
	apimetrics.LogRequestMetrics(ctx, "eve_token_login", duration, "success",
		"account_id", accountID,
		"first_login", firstLogin,
	)

	logs.InfoCtx(ctx, "successfully authenticated user",
		"account_id", accountID,
		"duration_ms", duration.Milliseconds(),
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
