package tasks

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"time"

	"eve-industry-planner/api/helper/auth"
	"eve-industry-planner/api/helper/sso"
	"eve-industry-planner/shared/core/config"
	natscore "eve-industry-planner/shared/core/nats"
	"eve-industry-planner/shared/logs"
	esicore "eve-industry-planner/worker/esi"
	esiratelimiter "eve-industry-planner/worker/ratelimiter"

	"github.com/hibiken/asynq"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/trace"
)

// ESI allows at most this many character IDs per POST /characters/affiliation/ request.
const maxCharacterAffiliationBatch = 1000

// CharacterAffiliation is one entry from POST /characters/affiliation/
// (see https://developers.eveonline.com/api-explorer#/operations/PostCharactersAffiliation).
type CharacterAffiliation struct {
	CharacterID   int `json:"character_id"`
	CorporationID int `json:"corporation_id"`
}

// UpdateCustomCorporationClaims processes a batch of EVE SSO tokens, extracts character IDs,
// queries ESI in one POST per batch of up to 1000 character IDs for corporation IDs, and stores
// the aggregated unique set in Redis. This task respects ESI rate limiting through the
// rate-limited ESI client.
// Returns an error if processing fails - asynq will automatically retry on error.
func UpdateCustomCorporationClaims(ctx context.Context, task *asynq.Task, deps *TaskDependencies) error {
	if task == nil {
		return fmt.Errorf("task is nil")
	}

	ctx, cancel := context.WithTimeout(ctx, 300*time.Second) // Longer timeout for batch processing
	defer cancel()

	logs.InfoCtx(ctx, "fetch corporations task received")

	// Parse JSON data from task payload
	request, err := UnmarshalTaskPayload[natscore.CorporationClaimsRequest](task)
	if err != nil {
		logs.WarnCtx(ctx, "failed to parse task data", "error", err)
		return fmt.Errorf("invalid task data: %w", err)
	}

	// Validate request data
	if request.AccountID == "" {
		logs.WarnCtx(ctx, "missing required parameter (account_id)")
		return fmt.Errorf("missing account_id")
	}

	if len(request.Tokens) == 0 {
		logs.WarnCtx(ctx, "no tokens provided in task request",
			"account_id", request.AccountID)
		return fmt.Errorf("no tokens provided")
	}

	if span := trace.SpanFromContext(ctx); span.IsRecording() {
		span.SetAttributes(
			attribute.String("account_id", request.AccountID),
			attribute.Int("token_count", len(request.Tokens)),
		)
	}

	cfg, err := config.LoadConfig()
	if err != nil {
		logs.ErrorCtx(ctx, "failed to load config", "error", err)
		return fmt.Errorf("failed to load config: %w", err)
	}

	corpSet := make(map[int64]bool)
	failedCount := 0
	seenChar := make(map[int]struct{})
	characterIDs := make([]int, 0, len(request.Tokens))

	for i, tokenString := range request.Tokens {
		claims, err := sso.ValidateEveSSOToken(tokenString, cfg.EveSSOClientID)
		if err != nil {
			logs.WarnCtx(ctx, "failed to validate EVE SSO token in worker",
				"index", i,
				"account_id", request.AccountID,
				"error", err)
			failedCount++
			continue
		}

		characterID := claims.CharacterID
		if characterID == "" {
			logs.WarnCtx(ctx, "missing character ID in token",
				"index", i,
				"account_id", request.AccountID)
			failedCount++
			continue
		}

		characterIDInt, err := strconv.Atoi(characterID)
		if err != nil {
			logs.WarnCtx(ctx, "invalid character ID format",
				"character_id", characterID,
				"index", i,
				"account_id", request.AccountID,
				"error", err)
			failedCount++
			continue
		}

		if _, ok := seenChar[characterIDInt]; ok {
			continue
		}
		seenChar[characterIDInt] = struct{}{}
		characterIDs = append(characterIDs, characterIDInt)
	}

	processedCount := 0

	if len(characterIDs) > 0 {
		affiliationPath := "/characters/affiliation/?datasource=tranquility"
		headers := map[string]string{
			"Content-Type":         "application/json",
			"X-Compatibility-Date": esicore.CompatibilityDate,
		}
		groupDesignation := esiratelimiter.GroupDesignation{}

		for start := 0; start < len(characterIDs); start += maxCharacterAffiliationBatch {
			end := start + maxCharacterAffiliationBatch
			if end > len(characterIDs) {
				end = len(characterIDs)
			}
			chunk := characterIDs[start:end]

			payload, err := json.Marshal(chunk)
			if err != nil {
				logs.ErrorCtx(ctx, "failed to marshal character ID batch for affiliation",
					"account_id", request.AccountID,
					"batch_size", len(chunk),
					"error", err)
				failedCount += len(chunk)
				continue
			}

			body, resp, err := DoEsiPostWithRetry(ctx, deps.ESIClient, 4, affiliationPath, headers, payload, groupDesignation)
			if err != nil {
				logs.ErrorCtx(ctx, "failed to fetch character affiliation from ESI API",
					"account_id", request.AccountID,
					"batch_size", len(chunk),
					"error", err)

				if esiratelimiter.IsRetryableRateLimitError(err) {
					logs.WarnCtx(ctx, "retryable rate limit error, returning error for retry",
						"account_id", request.AccountID,
						"error", err)
					return fmt.Errorf("rate limited: %w", err)
				}

				failedCount += len(chunk)
				continue
			}

			if resp == nil || resp.StatusCode != 200 {
				statusCode := 0
				if resp != nil {
					statusCode = resp.StatusCode
				}
				logs.WarnCtx(ctx, "ESI API returned non-200 status for affiliation",
					"account_id", request.AccountID,
					"status_code", statusCode,
					"batch_size", len(chunk))
				failedCount += len(chunk)
				continue
			}

			var affiliations []CharacterAffiliation
			if err := json.Unmarshal(body, &affiliations); err != nil {
				logs.ErrorCtx(ctx, "failed to parse affiliation response",
					"account_id", request.AccountID,
					"batch_size", len(chunk),
					"error", err)
				failedCount += len(chunk)
				continue
			}

			for _, row := range affiliations {
				if row.CorporationID > 0 {
					corpSet[int64(row.CorporationID)] = true
					processedCount++
				}
			}
		}
	}

	allCorporations := make([]int64, 0, len(corpSet))
	for corpID := range corpSet {
		allCorporations = append(allCorporations, corpID)
	}

	if err := auth.StoreCorporations(ctx, deps.Redis, request.AccountID, allCorporations); err != nil {
		logs.ErrorCtx(ctx, "failed to store corporation IDs in Redis",
			"account_id", request.AccountID,
			"corporation_count", len(allCorporations),
			"error", err)
		return fmt.Errorf("failed to store corporations: %w", err)
	}

	logs.InfoCtx(ctx, "successfully processed corporation lookup task",
		"account_id", request.AccountID,
		"total_tokens", len(request.Tokens),
		"processed", processedCount,
		"failed", failedCount,
		"unique_corporations", len(allCorporations))
	return nil
}
