package esi

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"time"

	"eve-industry-planner/api/api/helper/auth"
	"eve-industry-planner/api/api/helper/sso"
	"eve-industry-planner/shared/core/config"
	esiratelimiter "eve-industry-planner/shared/core/esi/rateLimiter"
	natscore "eve-industry-planner/shared/core/nats"
	"eve-industry-planner/shared/shared/logs"
)

// CharacterInfo represents the response from ESI API for character information
type CharacterInfo struct {
	CorporationID int `json:"corporation_id"`
}

// UpdateCustomCorporationClaims processes a batch of EVE SSO tokens, extracts character IDs,
// queries ESI API for corporation IDs, and stores the aggregated unique set in Redis.
// This task respects ESI rate limiting through the rate-limited ESI client.
func UpdateCustomCorporationClaims(natsMessage MessageInterface, deps *TaskDependencies) {
	ctx, cancel := context.WithTimeout(context.Background(), 300*time.Second) // Longer timeout for batch processing
	defer cancel()

	if natsMessage == nil {
		logs.Error("fetch corporations task requires a NATS message with data payload, exiting (nothing to acknowledge)")
		return
	}

	deliveryCount := natsMessage.NumDelivered()
	logs.Info("Fetch Corporations Message Received", "delivery_count", deliveryCount)

	// Parse JSON data from message payload
	var request natscore.CorporationClaimsRequest
	if err := natsMessage.ParseData(&request); err != nil {
		logs.Warn("failed to parse message data, dropping message", "error", err, "delivery_count", deliveryCount)
		if ackErr := natsMessage.Ack(); ackErr != nil {
			logs.Warn("failed to ack invalid message", "error", ackErr)
		}
		return
	}

	// Validate request data
	if request.AccountID == "" {
		logs.Warn("missing required parameter (account_id), dropping message",
			"delivery_count", deliveryCount)
		if ackErr := natsMessage.Ack(); ackErr != nil {
			logs.Warn("failed to ack message with missing account_id", "error", ackErr)
		}
		return
	}

	if len(request.Tokens) == 0 {
		logs.Warn("no tokens provided in task request, dropping message",
			"account_id", request.AccountID,
			"delivery_count", deliveryCount)
		if ackErr := natsMessage.Ack(); ackErr != nil {
			logs.Warn("failed to ack message with no tokens", "error", ackErr)
		}
		return
	}

	cfg := config.LoadConfig()

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
				"error", err,
				"delivery_count", deliveryCount)
			failedCount++
			continue
		}

		// Extract character ID
		characterID := claims.CharacterID
		if characterID == "" {
			logs.Warn("missing character ID in token",
				"index", i,
				"account_id", request.AccountID,
				"delivery_count", deliveryCount)
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
				"error", err,
				"delivery_count", deliveryCount)
			failedCount++
			continue
		}

		// Fetch character information from ESI API
		// Endpoint: GET /v5/characters/{character_id}/
		path := fmt.Sprintf("/v5/characters/%d/?datasource=tranquility", characterIDInt)
		groupDesignation := esiratelimiter.GroupDesignation{
			PrimaryGroup: "characters", // Character endpoints use "characters" group
		}
		body, resp, err := deps.ESIClient.Do(ctx, "GET", path, nil, groupDesignation)
		if err != nil {
			logs.Error("failed to fetch character info from ESI API",
				"character_id", characterID,
				"account_id", request.AccountID,
				"index", i,
				"error", err,
				"delivery_count", deliveryCount)

			// Check if it's a rate limit error - if retryable, nack with delay
			if esiratelimiter.IsRetryableRateLimitError(err) {
				logs.Warn("retryable rate limit error, nacking message for retry",
					"character_id", characterID,
					"account_id", request.AccountID,
					"error", err)
				if nackErr := natsMessage.Nak(); nackErr != nil {
					logs.Warn("failed to nack message", "error", nackErr)
				}
				return // Nack the entire message to retry all tokens
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
				"index", i,
				"delivery_count", deliveryCount)
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
				"error", err,
				"delivery_count", deliveryCount)
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
			"error", err,
			"delivery_count", deliveryCount)

		// Try to ack anyway - some ESI calls succeeded, just storage failed
		if ackErr := natsMessage.Ack(); ackErr != nil {
			logs.Warn("failed to ack message after storage error", "error", ackErr)
		}
		return
	}

	// Acknowledge successful processing
	if err := natsMessage.Ack(); err != nil {
		logs.Warn("failed to ack message after successful processing", "error", err)
		return
	}

	logs.Info("successfully processed corporation lookup task",
		"account_id", request.AccountID,
		"total_tokens", len(request.Tokens),
		"processed", processedCount,
		"failed", failedCount,
		"unique_corporations", len(allCorporations),
		"delivery_count", deliveryCount)
}
