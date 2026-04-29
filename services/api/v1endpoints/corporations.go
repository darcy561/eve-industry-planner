package v1endpoints

import (
	"context"
	"errors"
	"eve-industry-planner/api/helper"
	"fmt"
	"net/http"
	"strings"
	"time"

	"eve-industry-planner/api/helper/auth"
	"eve-industry-planner/api/helper/sso"
	"eve-industry-planner/shared/core/config"
	"eve-industry-planner/shared/core/internaljwt"
	natscore "eve-industry-planner/shared/core/nats"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/shared"
	taskscore "eve-industry-planner/shared/tasks"
	"eve-industry-planner/shared/telemetry/apimetrics"
)

// CorporationsRequest represents the request body for corporation claims
type CorporationsRequest struct {
	Tokens []string `json:"tokens"` // Array of EVE SSO JWT tokens
}

// CorporationsHandler handles POST /api/v1/auth/claims/corporations.
//
// Registered on the private mux group (apiServer): global middleware → rate limit →
// [middleware.AuthConstructor] → this handler. Align with frontend withRequestRetries:
// retry only 408, 429, 5xx (see Endpoints/withRequestRetries.js defaultIsRetriableHttpStatus).
//
// Before this handler:
//   - 429 — rate limiter (private); safe to retry with backoff
//   - 401 — auth middleware: missing/invalid Bearer / internal JWT (do not retry without refresh)
//
// This handler (also validates auth again for AccountID claims; usually redundant if middleware passed):
//   - 405 — method != POST
//   - 401 — missing/invalid Bearer, invalid internal JWT, empty AccountID in claims
//   - 400 — invalid JSON/body, no tokens, too many tokens (>50), empty token, no valid SSO tokens after validation
//   - 500 — config load failure, NATS publish failure
//   - 204 — task queued successfully (no body)
//
// Accepts multiple EVE SSO tokens, validates them, and publishes one worker task.
func CorporationsHandler(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	ctx := r.Context()
	start := helper.RequestStartOrNow(ctx)
	m := apimetrics.GetAPIEveTokenLogin() // Reuse auth metrics for now
	metrics := helper.BeginRequestMetrics(ctx, helper.RequestMetricsHooks{
		ObserveDuration: func(ctx context.Context, ms float64) { m.Requests.Observe(ctx, ms) },
		IncRequests:     func(ctx context.Context) { m.RequestsCount.Inc(ctx) },
		IncSuccesses:    func(ctx context.Context) { m.Successes.Inc(ctx) },
		IncErrors:       func(ctx context.Context, reason string) { m.Errors.WithLabelValues(reason).Inc(ctx) },
	})
	defer metrics.Finish()

	// Only allow POST requests
	if !helper.RequireMethod(w, r, http.MethodPost) {
		metrics.Error("method_not_allowed")
		logs.WarnCtx(ctx, "invalid method for corporations endpoint")
		return
	}

	// Extract and validate internal JWT token from Authorization header
	authHeader := r.Header.Get("Authorization")
	if authHeader == "" {
		metrics.Error("missing_auth")
		logs.WarnCtx(ctx, "missing Authorization header")
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Extract Bearer token
	const bearerPrefix = "Bearer "
	if !strings.HasPrefix(authHeader, bearerPrefix) {
		metrics.Error("invalid_auth_format")
		logs.WarnCtx(ctx, "invalid Authorization header format")
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	internalTokenString := strings.TrimSpace(authHeader[len(bearerPrefix):])
	if internalTokenString == "" {
		metrics.Error("empty_token")
		logs.WarnCtx(ctx, "empty token in Authorization header")
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Validate internal JWT token and extract AccountID
	internalClaims, err := internaljwt.ValidateInternalJWT(internalTokenString)
	if err != nil {
		metrics.Error("invalid_token")
		logs.WarnCtx(ctx, "failed to validate internal JWT token", "error", err)
		http.Error(w, auth.GetAuthErrorMessage(err), http.StatusUnauthorized)
		return
	}

	// Use AccountID from the internal token
	accountID := internalClaims.AccountID
	if accountID == "" {
		metrics.Error("missing_account_id")
		logs.WarnCtx(ctx, "AccountID missing from internal token")
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Extract tokens from request body
	reqBody, err := extractCorporationsRequest(r)
	if err != nil {
		metrics.Error("extraction_error")
		logs.WarnCtx(ctx, "failed to extract tokens from request body", "error", err, "account_id", accountID)
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	if len(reqBody.Tokens) == 0 {
		metrics.Error("no_tokens")
		logs.WarnCtx(ctx, "no tokens provided in request", "account_id", accountID)
		http.Error(w, "No tokens provided", http.StatusBadRequest)
		return
	}

	// Limit the number of tokens to prevent abuse
	const maxTokens = 50
	if len(reqBody.Tokens) > maxTokens {
		metrics.Error("too_many_tokens")
		logs.WarnCtx(ctx, "too many tokens provided", "account_id", accountID, "count", len(reqBody.Tokens), "max", maxTokens)
		http.Error(w, fmt.Sprintf("Too many tokens (max %d)", maxTokens), http.StatusBadRequest)
		return
	}

	cfg, err := config.LoadConfig()
	if err != nil {
		metrics.Error("config_error")
		logs.ErrorCtx(ctx, "failed to load config for corporations endpoint", "error", err, "account_id", accountID)
		logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Internal server error", err)
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
		metrics.Error("no_valid_tokens")
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
		metrics.Error("publish_error")
		logs.ErrorCtx(ctx, "failed to publish corporation lookup task",
			"account_id", accountID,
			"token_count", len(validTokens),
			"error", err)
		logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Internal server error", err)
		return
	}

	// Return 204 No Content - task queued successfully, no response body needed
	w.WriteHeader(http.StatusNoContent)
	metrics.Success()

	logs.InfoCtx(ctx, "successfully queued corporation lookup task",
		"account_id", accountID,
		"valid_tokens", len(validTokens),
		"total_tokens", len(reqBody.Tokens),
		"duration_ms", time.Since(start).Milliseconds(),
	)
}

// extractCorporationsRequest extracts the tokens array from the request body
func extractCorporationsRequest(r *http.Request) (*CorporationsRequest, error) {
	const maxBodySize = 50*maxTokenLength + 1024

	var reqBody CorporationsRequest
	if err := helper.DecodeJSONRequest(r, &reqBody, maxBodySize); err != nil {
		return nil, err
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
