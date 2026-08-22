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
	AllianceID    int `json:"alliance_id"`
}

// RefreshAccountSessionGrants validates a batch of EVE SSO tokens, resolves character IDs,
// queries ESI POST /characters/affiliation/ (batched), aggregates unique corporation and
// alliance IDs, persists them to Redis, and updates account session grants for all sessions.
func RefreshAccountSessionGrants(ctx context.Context, task *asynq.Task, deps *TaskDependencies) error {
	if task == nil {
		return fmt.Errorf("task is nil")
	}

	ctx, cancel := context.WithTimeout(ctx, 300*time.Second)
	defer cancel()

	logs.InfoCtx(ctx, "account session grants refresh task received")

	request, err := UnmarshalTaskPayload[natscore.AccountSessionGrantsRequest](task)
	if err != nil {
		logs.WarnCtx(ctx, "failed to parse task data", "error", err)
		return fmt.Errorf("invalid task data: %w", err)
	}

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

	ssoCfg := config.LoadEveSSO()

	corpSet := make(map[int64]bool)
	allianceSet := make(map[int64]bool)
	failedCount := 0
	seenChar := make(map[int]struct{})
	characterIDs := make([]int, 0, len(request.Tokens))

	for i, tokenString := range request.Tokens {
		claims, err := sso.ValidateEveSSOToken(tokenString, ssoCfg.ClientID)
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
			end := min(start+maxCharacterAffiliationBatch, len(characterIDs))
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
				if row.AllianceID > 0 {
					allianceSet[int64(row.AllianceID)] = true
					processedCount++
				}
			}
		}
	}

	allCorporations := make([]int64, 0, len(corpSet))
	for corpID := range corpSet {
		allCorporations = append(allCorporations, corpID)
	}
	allAlliances := make([]int64, 0, len(allianceSet))
	for aid := range allianceSet {
		allAlliances = append(allAlliances, aid)
	}

	if err := auth.StoreCorporations(ctx, deps.Redis, request.AccountID, allCorporations); err != nil {
		logs.ErrorCtx(ctx, "failed to store corporation IDs in Redis",
			"account_id", request.AccountID,
			"corporation_count", len(allCorporations),
			"error", err)
		return fmt.Errorf("failed to store corporations: %w", err)
	}
	if err := auth.StoreAlliances(ctx, deps.Redis, request.AccountID, allAlliances); err != nil {
		logs.ErrorCtx(ctx, "failed to store alliance IDs in Redis",
			"account_id", request.AccountID,
			"alliance_count", len(allAlliances),
			"error", err)
		return fmt.Errorf("failed to store alliances: %w", err)
	}
	entityCipher := deps.EntityCipher
	if entityCipher == nil {
		return fmt.Errorf("entity ref helper is required")
	}
	if err := auth.UpdateAccountSessionGrants(ctx, deps.Redis, entityCipher, request.AccountID, allCorporations, allAlliances); err != nil {
		logs.WarnCtx(ctx, "failed to update account session grants from affiliation lookup",
			"account_id", request.AccountID,
			"error", err)
	}

	logs.InfoCtx(ctx, "successfully processed account session grants refresh task",
		"account_id", request.AccountID,
		"total_tokens", len(request.Tokens),
		"affiliation_cells", processedCount,
		"failed", failedCount,
		"unique_corporations", len(allCorporations),
		"unique_alliances", len(allAlliances))
	return nil
}
