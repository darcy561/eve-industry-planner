package tasks

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"time"

	"eve-industry-planner/api/api/helper/auth"
	"eve-industry-planner/api/api/helper/sso"
	"eve-industry-planner/shared/core/config"
	natscore "eve-industry-planner/shared/core/nats"
	"eve-industry-planner/shared/shared/logs"
	esiratelimiter "eve-industry-planner/worker/ratelimiter"

	"github.com/hibiken/asynq"
)

// CharacterInfo represents the response from ESI API for character information
type CharacterInfo struct {
	CorporationID int `json:"corporation_id"`
}

// UpdateCustomCorporationClaims processes a batch of EVE SSO tokens, extracts character IDs,
// queries ESI API for corporation IDs, and stores the aggregated unique set in Redis.
// This task respects ESI rate limiting through the rate-limited ESI client.
// Returns an error if processing fails - asynq will automatically retry on error.
func UpdateCustomCorporationClaims(ctx context.Context, task *asynq.Task, deps *TaskDependencies) error {
	if task == nil {
		return fmt.Errorf("task is nil")
	}

	ctx, cancel := context.WithTimeout(ctx, 300*time.Second) // Longer timeout for batch processing
	defer cancel()

	logs.Info("Fetch Corporations Task Received")

	// Parse JSON data from task payload
	request, err := UnmarshalTaskPayload[natscore.CorporationClaimsRequest](task)
	if err != nil {
		logs.Warn("failed to parse task data", "error", err)
		return fmt.Errorf("invalid task data: %w", err)
	}

	// Validate request data
	if request.AccountID == "" {
		logs.Warn("missing required parameter (account_id)")
		return fmt.Errorf("missing account_id")
	}

	if len(request.Tokens) == 0 {
		logs.Warn("no tokens provided in task request",
			"account_id", request.AccountID)
		return fmt.Errorf("no tokens provided")
	}

	cfg, err := config.LoadConfig()
	if err != nil {
		logs.Error("failed to load config", "error", err)
		return fmt.Errorf("failed to load config: %w", err)
	}

	// Process all EVE SSO tokens and collect corporation IDs
	corpSet := make(map[int64]bool)
	processedCount := 0
	failedCount := 0

	for i, tokenString := range request.Tokens {
		// Validate the EVE SSO token
		claims, err := sso.ValidateEveSSOToken(tokenString, cfg.EveSSOClientID)
		if err != nil {
			logs.Warn("failed to validate EVE SSO token in worker",
				"index", i,
				"account_id", request.AccountID,
				"error", err)
			failedCount++
			continue
		}

		// Extract character ID
		characterID := claims.CharacterID
		if characterID == "" {
			logs.Warn("missing character ID in token",
				"index", i,
				"account_id", request.AccountID)
			failedCount++
			continue
		}

		// Parse character ID to integer
		characterIDInt, err := strconv.Atoi(characterID)
		if err != nil {
			logs.Warn("invalid character ID format",
				"character_id", characterID,
				"index", i,
				"account_id", request.AccountID,
				"error", err)
			failedCount++
			continue
		}

		// Fetch character information from ESI API
		// Endpoint: GET /v5/characters/{character_id}/
		path := fmt.Sprintf("/v5/characters/%d/?datasource=tranquility", characterIDInt)
		groupDesignation := esiratelimiter.GroupDesignation{}
		body, resp, err := deps.ESIClient.Do(ctx, "GET", path, nil, groupDesignation)
		if err != nil {
			logs.Error("failed to fetch character info from ESI API",
				"character_id", characterID,
				"account_id", request.AccountID,
				"index", i,
				"error", err)

			// Check if it's a rate limit error - return error for asynq to retry
			if esiratelimiter.IsRetryableRateLimitError(err) {
				logs.Warn("retryable rate limit error, returning error for retry",
					"character_id", characterID,
					"account_id", request.AccountID,
					"error", err)
				return fmt.Errorf("rate limited: %w", err)
			}

			// Non-retryable error - continue with other tokens
			failedCount++
			continue
		}

		// Check response status
		if resp == nil || resp.StatusCode != 200 {
			statusCode := 0
			if resp != nil {
				statusCode = resp.StatusCode
			}
			logs.Warn("ESI API returned non-200 status",
				"character_id", characterID,
				"account_id", request.AccountID,
				"status_code", statusCode,
				"index", i)
			failedCount++
			continue
		}

		// Parse character information
		var characterInfo CharacterInfo
		if err := json.Unmarshal(body, &characterInfo); err != nil {
			logs.Error("failed to parse character info response",
				"character_id", characterID,
				"account_id", request.AccountID,
				"index", i,
				"error", err)
			failedCount++
			continue
		}

		// Add corporation ID to set (automatically handles duplicates)
		if characterInfo.CorporationID > 0 {
			corpSet[int64(characterInfo.CorporationID)] = true
			processedCount++
		}
	}

	// Convert set to slice (unique corporation IDs, no duplicates)
	allCorporations := make([]int64, 0, len(corpSet))
	for corpID := range corpSet {
		allCorporations = append(allCorporations, corpID)
	}

	// Store aggregated corporations for the account (keyed by AccountID)
	if err := auth.StoreCorporations(ctx, deps.Redis, request.AccountID, allCorporations); err != nil {
		logs.Error("failed to store corporation IDs in Redis",
			"account_id", request.AccountID,
			"corporation_count", len(allCorporations),
			"error", err)
		return fmt.Errorf("failed to store corporations: %w", err)
	}

	logs.Info("successfully processed corporation lookup task",
		"account_id", request.AccountID,
		"total_tokens", len(request.Tokens),
		"processed", processedCount,
		"failed", failedCount,
		"unique_corporations", len(allCorporations))
	return nil
}
