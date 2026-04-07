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
	"eve-industry-planner/api/helper/sso"
	"eve-industry-planner/shared/core/config"
	natscore "eve-industry-planner/shared/core/nats"
	"eve-industry-planner/shared/shared"
	"eve-industry-planner/shared/logs"
	taskscore "eve-industry-planner/shared/tasks"
	"eve-industry-planner/shared/telemetry/apimetrics"
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
	ctx := r.Context()
	start, ok := logs.RequestStartTime(ctx)
	if !ok {
		start = time.Now()
	}
	m := apimetrics.GetAPIEveTokenLogin() // Reuse auth metrics for now

	// Only allow POST requests
	if r.Method != http.MethodPost {
		m.Errors.WithLabelValues("method_not_allowed").Inc(ctx)
		logs.WarnCtx(ctx, "invalid method for corporations endpoint")
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Extract and validate internal JWT token from Authorization header
	authHeader := r.Header.Get("Authorization")
	if authHeader == "" {
		m.Errors.WithLabelValues("missing_auth").Inc(ctx)
		logs.WarnCtx(ctx, "missing Authorization header")
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Extract Bearer token
	const bearerPrefix = "Bearer "
	if !strings.HasPrefix(authHeader, bearerPrefix) {
		m.Errors.WithLabelValues("invalid_auth_format").Inc(ctx)
		logs.WarnCtx(ctx, "invalid Authorization header format")
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	internalTokenString := strings.TrimSpace(authHeader[len(bearerPrefix):])
	if internalTokenString == "" {
		m.Errors.WithLabelValues("empty_token").Inc(ctx)
		logs.WarnCtx(ctx, "empty token in Authorization header")
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Validate internal JWT token and extract AccountID
	internalClaims, err := auth.ValidateInternalJWT(internalTokenString)
	if err != nil {
		m.Errors.WithLabelValues("invalid_token").Inc(ctx)
		logs.WarnCtx(ctx, "failed to validate internal JWT token", "error", err)
		http.Error(w, auth.GetAuthErrorMessage(err), http.StatusUnauthorized)
		return
	}

	// Use AccountID from the internal token
	accountID := internalClaims.AccountID
	if accountID == "" {
		m.Errors.WithLabelValues("missing_account_id").Inc(ctx)
		logs.WarnCtx(ctx, "AccountID missing from internal token")
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Extract tokens from request body
	reqBody, err := extractCorporationsRequest(r)
	if err != nil {
		m.Errors.WithLabelValues("extraction_error").Inc(ctx)
		logs.WarnCtx(ctx, "failed to extract tokens from request body", "error", err, "account_id", accountID)
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	if len(reqBody.Tokens) == 0 {
		m.Errors.WithLabelValues("no_tokens").Inc(ctx)
		logs.WarnCtx(ctx, "no tokens provided in request", "account_id", accountID)
		http.Error(w, "No tokens provided", http.StatusBadRequest)
		return
	}

	// Limit the number of tokens to prevent abuse
	const maxTokens = 50
	if len(reqBody.Tokens) > maxTokens {
		m.Errors.WithLabelValues("too_many_tokens").Inc(ctx)
		logs.WarnCtx(ctx, "too many tokens provided", "account_id", accountID, "count", len(reqBody.Tokens), "max", maxTokens)
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
			logs.WarnCtx(ctx, "token too long", "account_id", accountID, "index", i, "length", len(tokenString), "max", maxTokenLength)
			continue
		}

		// Validate the EVE SSO token
		claims, err := sso.ValidateEveSSOToken(tokenString, cfg.EveSSOClientID)
		if err != nil {
			logs.WarnCtx(ctx, "failed to validate EVE SSO token", "account_id", accountID, "index", i, "error", err)
			continue
		}

		// Verify character ID is present
		if claims.CharacterID == "" {
			logs.WarnCtx(ctx, "missing character ID in token", "account_id", accountID, "index", i)
			continue
		}

		validTokens = append(validTokens, tokenString)
	}

	if len(validTokens) == 0 {
		m.Errors.WithLabelValues("no_valid_tokens").Inc(ctx)
		logs.WarnCtx(ctx, "no valid tokens found in request", "account_id", accountID)
		http.Error(w, "No valid tokens provided", http.StatusBadRequest)
		return
	}

	// Submit single task with AccountID and all valid EVE SSO tokens
	taskRequest := natscore.CorporationClaimsRequest{
		AccountID: accountID,
		Tokens:    validTokens,
	}

	if err := natscore.PublishTask(ctx, clients.JetStream, taskscore.FetchCorporations.Subject, taskscore.FetchCorporations.Name, taskRequest, clients.NATS); err != nil {
		m.Errors.WithLabelValues("publish_error").Inc(ctx)
		logs.ErrorCtx(ctx, "failed to publish corporation lookup task",
			"account_id", accountID,
			"token_count", len(validTokens),
			"error", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	// Return 204 No Content - task queued successfully, no response body needed
	w.WriteHeader(http.StatusNoContent)

	// Update metrics
	duration := time.Since(start)
	m.Requests.Observe(ctx, apimetrics.DurationMilliseconds(duration))
	m.RequestsCount.Inc(ctx)
	m.Successes.Inc(ctx)

	logs.InfoCtx(ctx, "successfully queued corporation lookup task",
		"account_id", accountID,
		"valid_tokens", len(validTokens),
		"total_tokens", len(reqBody.Tokens),
		"duration_ms", duration.Milliseconds(),
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
