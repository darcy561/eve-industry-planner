package v1endpoints

import (
	"context"
	"errors"
	"eve-industry-planner/shared/stackservices"
	"fmt"
	"net/http"
	"strings"
	"time"

	"eve-industry-planner/api/helper"
	"eve-industry-planner/api/helper/sso"
	"eve-industry-planner/shared/core/config"
	natscore "eve-industry-planner/shared/core/nats"
	"eve-industry-planner/shared/logs"
	taskscore "eve-industry-planner/shared/tasks"
	"eve-industry-planner/shared/telemetry/apimetrics"
)

// CorporationsRequest represents the request body for corporation claims
type CorporationsRequest struct {
	Tokens []string `json:"tokens"` // Array of EVE SSO JWT tokens
}

// CorporationsHandler handles POST /api/v1/corporation-claims.
func CorporationsHandler(w http.ResponseWriter, r *http.Request, clients *stackservices.Clients) {
	ctx := r.Context()
	start := helper.RequestStartOrNow(ctx)
	m := apimetrics.GetAPIEveTokenLogin()
	metrics := helper.BeginRequestMetrics(ctx, helper.RequestMetricsHooks{
		ObserveDuration: func(ctx context.Context, ms float64) { m.Requests.Observe(ctx, ms) },
		IncRequests:     func(ctx context.Context) { m.RequestsCount.Inc(ctx) },
		IncSuccesses:    func(ctx context.Context) { m.Successes.Inc(ctx) },
		IncErrors:       func(ctx context.Context, reason string) { m.Errors.WithLabelValues(reason).Inc(ctx) },
	})
	defer metrics.Finish()

	if !helper.RequireMethod(w, r, http.MethodPost) {
		metrics.Error("method_not_allowed")
		return
	}

	accountID := helper.AuthenticatedAccountID(r)

	reqBody, err := extractCorporationsRequest(r)
	if err != nil {
		metrics.Error("extraction_error")
		helper.RespondEndpointError(w, r, http.StatusBadRequest, "Invalid request", "failed to extract tokens from request body", "corporations_extraction_error", "corporations", err, nil)
		return
	}

	if len(reqBody.Tokens) == 0 {
		metrics.Error("no_tokens")
		helper.RespondEndpointError(w, r, http.StatusBadRequest, "No tokens provided", "no tokens provided in request", "corporations_no_tokens", "corporations", nil, nil)
		return
	}

	const maxTokens = 50
	if len(reqBody.Tokens) > maxTokens {
		metrics.Error("too_many_tokens")
		helper.RespondEndpointError(w, r, http.StatusBadRequest, fmt.Sprintf("Too many tokens (max %d)", maxTokens), "too many tokens provided", "corporations_too_many_tokens", "corporations", nil, map[string]interface{}{
			"count": len(reqBody.Tokens),
			"max":   maxTokens,
		})
		return
	}

	ssoCfg := config.LoadEveSSO()

	validTokens := make([]string, 0)
	skippedTokens := 0
	for _, tokenString := range reqBody.Tokens {
		if len(tokenString) > maxTokenLength {
			skippedTokens++
			continue
		}

		claims, err := sso.ValidateEveSSOToken(tokenString, ssoCfg.ClientID)
		if err != nil {
			skippedTokens++
			continue
		}

		if claims.CharacterID == "" {
			skippedTokens++
			continue
		}

		validTokens = append(validTokens, tokenString)
	}

	if len(validTokens) == 0 {
		metrics.Error("no_valid_tokens")
		helper.RespondEndpointError(w, r, http.StatusBadRequest, "No valid tokens provided", "no valid tokens found in request", "corporations_no_valid_tokens", "corporations", nil, map[string]interface{}{
			"total_tokens": len(reqBody.Tokens),
		})
		return
	}

	logs.AttachDebugStep(r, "tokens_validated", map[string]interface{}{
		"total_tokens":   len(reqBody.Tokens),
		"valid_tokens":   len(validTokens),
		"skipped_tokens": skippedTokens,
	})

	taskRequest := natscore.AccountSessionGrantsRequest{
		AccountID: accountID,
		Tokens:    validTokens,
	}

	if err := natscore.PublishTask(ctx, clients.JetStream, taskscore.UpdateAccountSessionGrants.Subject, taskscore.UpdateAccountSessionGrants.Name, taskRequest, clients.NATS); err != nil {
		metrics.Error("publish_error")
		helper.RespondEndpointServerError(w, r, "Internal server error", "failed to publish account session grants refresh task", "corporations_publish_failed", "corporations", err, map[string]interface{}{"token_count": len(validTokens)})
		return
	}

	logs.AttachDebugStep(r, "grants_task_published", map[string]interface{}{
		"valid_tokens": len(validTokens),
	})

	w.WriteHeader(http.StatusNoContent)
	metrics.Success()

	if skippedTokens > 0 {
		logs.AttachHandlerCaveat(r, "tokens_skipped", "some tokens rejected during validation", map[string]interface{}{
			"skipped": skippedTokens,
			"total":   len(reqBody.Tokens),
			"valid":   len(validTokens),
		})
	}

	logs.AttachHandlerSuccessDetail(r, "successfully queued account session grants refresh task", map[string]interface{}{
		"valid_tokens": len(validTokens),
		"total_tokens": len(reqBody.Tokens),
		"duration_ms":  time.Since(start).Milliseconds(),
	})
}

func extractCorporationsRequest(r *http.Request) (*CorporationsRequest, error) {
	const maxBodySize = 50*maxTokenLength + 1024

	var reqBody CorporationsRequest
	if err := helper.DecodeJSONRequest(r, &reqBody, maxBodySize); err != nil {
		return nil, err
	}

	if reqBody.Tokens == nil {
		return nil, errors.New("tokens array is required")
	}

	for i, token := range reqBody.Tokens {
		reqBody.Tokens[i] = strings.TrimSpace(token)
		if reqBody.Tokens[i] == "" {
			return nil, fmt.Errorf("token at index %d cannot be empty", i)
		}
	}

	return &reqBody, nil
}
