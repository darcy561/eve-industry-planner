package v1endpoints

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"eve-industry-planner/api/api/helper/auth"
	"eve-industry-planner/api/api/helper/sso"
	"eve-industry-planner/shared/core/config"
	natscore "eve-industry-planner/shared/core/nats"
	"eve-industry-planner/shared/shared"
	"eve-industry-planner/shared/shared/logs"
	"eve-industry-planner/shared/shared/metrics"
	taskscore "eve-industry-planner/shared/tasks"
)

// CorporationsRequest represents the request body for corporation claims
type CorporationsRequest struct {
	Tokens []string `json:"tokens"` // Array of EVE SSO JWT tokens
}

// CorporationsHandler handles requests to add corporation claims to JWT tokens
// Requires authentication via internal JWT token in Authorization header
// Accepts multiple EVE SSO tokens, validates them, and submits a single task to worker
// Worker will extract character IDs, query ESI, and aggregate corporation IDs by AccountID
func CorporationsHandler(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	start := time.Now()
	m := metrics.GetAPIAuthLogin() // Reuse auth metrics for now

	// Only allow POST requests
	if r.Method != http.MethodPost {
		m.Errors.WithLabelValues("method_not_allowed").Inc()
		logs.WarnCtx(r.Context(), "invalid method for corporations endpoint", "method", r.Method, "ip", r.RemoteAddr)
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Extract and validate internal JWT token from Authorization header
	authHeader := r.Header.Get("Authorization")
	if authHeader == "" {
		m.Errors.WithLabelValues("missing_auth").Inc()
		logs.WarnCtx(r.Context(), "missing Authorization header", "ip", r.RemoteAddr)
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Extract Bearer token
	const bearerPrefix = "Bearer "
	if !strings.HasPrefix(authHeader, bearerPrefix) {
		m.Errors.WithLabelValues("invalid_auth_format").Inc()
		logs.WarnCtx(r.Context(), "invalid Authorization header format", "ip", r.RemoteAddr)
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	internalTokenString := strings.TrimSpace(authHeader[len(bearerPrefix):])
	if internalTokenString == "" {
		m.Errors.WithLabelValues("empty_token").Inc()
		logs.WarnCtx(r.Context(), "empty token in Authorization header", "ip", r.RemoteAddr)
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Validate internal JWT token and extract AccountID
	internalClaims, err := auth.ValidateInternalJWT(internalTokenString)
	if err != nil {
		m.Errors.WithLabelValues("invalid_token").Inc()
		logs.WarnCtx(r.Context(), "failed to validate internal JWT token", "error", err, "ip", r.RemoteAddr)
		http.Error(w, auth.GetAuthErrorMessage(err), http.StatusUnauthorized)
		return
	}

	// Use AccountID from the internal token
	accountID := internalClaims.AccountID
	if accountID == "" {
		m.Errors.WithLabelValues("missing_account_id").Inc()
		logs.WarnCtx(r.Context(), "AccountID missing from internal token", "ip", r.RemoteAddr)
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Extract tokens from request body
	reqBody, err := extractCorporationsRequest(r)
	if err != nil {
		m.Errors.WithLabelValues("extraction_error").Inc()
		logs.WarnCtx(r.Context(), "failed to extract tokens from request body", "error", err, "ip", r.RemoteAddr)
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	if len(reqBody.Tokens) == 0 {
		m.Errors.WithLabelValues("no_tokens").Inc()
		logs.WarnCtx(r.Context(), "no tokens provided in request", "ip", r.RemoteAddr)
		http.Error(w, "No tokens provided", http.StatusBadRequest)
		return
	}

	// Limit the number of tokens to prevent abuse
	const maxTokens = 50
	if len(reqBody.Tokens) > maxTokens {
		m.Errors.WithLabelValues("too_many_tokens").Inc()
		logs.WarnCtx(r.Context(), "too many tokens provided", "count", len(reqBody.Tokens), "max", maxTokens, "ip", r.RemoteAddr)
		http.Error(w, fmt.Sprintf("Too many tokens (max %d)", maxTokens), http.StatusBadRequest)
		return
	}

	cfg, err := config.LoadConfig()
	if err != nil {
		http.Error(w, "Configuration error: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Validate each EVE SSO token before submitting to worker
	validTokens := make([]string, 0)
	for i, tokenString := range reqBody.Tokens {
		// Validate token length
		if len(tokenString) > maxTokenLength {
			logs.WarnCtx(r.Context(), "token too long", "index", i, "length", len(tokenString), "max", maxTokenLength, "ip", r.RemoteAddr)
			continue
		}

		// Validate the EVE SSO token
		claims, err := sso.ValidateEveSSOToken(tokenString, cfg.EveSSOClientID)
		if err != nil {
			logs.WarnCtx(r.Context(), "failed to validate EVE SSO token", "index", i, "error", err, "ip", r.RemoteAddr)
			continue
		}

		// Verify character ID is present
		if claims.CharacterID == "" {
			logs.WarnCtx(r.Context(), "missing character ID in token", "index", i, "ip", r.RemoteAddr)
			continue
		}

		validTokens = append(validTokens, tokenString)
	}

	if len(validTokens) == 0 {
		m.Errors.WithLabelValues("no_valid_tokens").Inc()
		logs.WarnCtx(r.Context(), "no valid tokens found in request", "ip", r.RemoteAddr)
		http.Error(w, "No valid tokens provided", http.StatusBadRequest)
		return
	}

	// Submit single task with AccountID and all valid EVE SSO tokens
	taskRequest := natscore.CorporationClaimsRequest{
		AccountID: accountID,
		Tokens:    validTokens,
	}

	if err := natscore.PublishTask(clients.JetStream, taskscore.FetchCorporations.Subject, taskscore.FetchCorporations.Name, taskRequest, clients.NATS); err != nil {
		m.Errors.WithLabelValues("publish_error").Inc()
		logs.ErrorCtx(r.Context(), "failed to publish corporation lookup task",
			"account_id", accountID,
			"token_count", len(validTokens),
			"error", err,
			"ip", r.RemoteAddr)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	// Return 204 No Content - task queued successfully, no response body needed
	w.WriteHeader(http.StatusNoContent)

	// Update metrics
	duration := time.Since(start)
	m.Requests.Observe(duration.Seconds())
	m.RequestsCount.Inc()
	m.Successes.Inc()

	logs.InfoCtx(r.Context(), "successfully queued corporation lookup task",
		"account_id", accountID,
		"valid_tokens", len(validTokens),
		"total_tokens", len(reqBody.Tokens),
		"duration_ms", duration.Milliseconds(),
		"ip", r.RemoteAddr,
	)
}

// extractCorporationsRequest extracts the tokens array from the request body
func extractCorporationsRequest(r *http.Request) (*CorporationsRequest, error) {
	// Limit request body size to prevent DoS attacks
	// maxTokens * maxTokenLength + JSON overhead
	const maxBodySize = 50*maxTokenLength + 1024
	r.Body = http.MaxBytesReader(nil, r.Body, maxBodySize)

	var reqBody CorporationsRequest

	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()

	if err := decoder.Decode(&reqBody); err != nil {
		if err == io.EOF {
			return nil, errors.New("request body is required")
		}
		if strings.Contains(err.Error(), "request body too large") {
			return nil, errors.New("request body too large")
		}
		return nil, fmt.Errorf("invalid request body: %w", err)
	}

	// Ensure body was fully consumed (prevents extra data attacks)
	if _, err := decoder.Token(); err != io.EOF {
		return nil, errors.New("request body contains extra data")
	}

	// Validate tokens array
	if reqBody.Tokens == nil {
		return nil, errors.New("tokens array is required")
	}

	// Trim whitespace from each token
	for i, token := range reqBody.Tokens {
		reqBody.Tokens[i] = strings.TrimSpace(token)
		if reqBody.Tokens[i] == "" {
			return nil, fmt.Errorf("token at index %d cannot be empty", i)
		}
	}

	return &reqBody, nil
}
