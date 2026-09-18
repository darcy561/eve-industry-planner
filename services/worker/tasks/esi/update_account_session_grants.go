package esi

import (
	"context"
	"eve-industry-planner/shared/jsoncodec"
	"eve-industry-planner/worker/taskrun"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"time"

	"eve-industry-planner/shared/core/config"
	"eve-industry-planner/shared/crypto/entityid"
	"eve-industry-planner/shared/esiclient"
	"eve-industry-planner/shared/evesso"
	"eve-industry-planner/shared/httpclient"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/models"
	eipnats "eve-industry-planner/shared/nats"
	"eve-industry-planner/shared/plannersession"

	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/trace"
)

// ESI allows at most this many character IDs per POST /characters/affiliation/ request.
const maxCharacterAffiliationBatch = 1000

// RefreshAccountSessionGrants validates a batch of EVE SSO tokens, resolves character IDs,
// queries ESI POST /characters/affiliation/ (batched), aggregates unique corporation and
// alliance IDs, persists them to Redis, and updates account session grants for all sessions.
func RefreshAccountSessionGrants(ctx context.Context, request eipnats.AccountSessionGrantsRequest, deps *taskrun.Dependencies) error {
	ctx, cancel := context.WithTimeout(ctx, 300*time.Second)
	defer cancel()

	logs.InfoCtx(ctx, "account session grants refresh task received")

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
		claims, err := evesso.ValidateEveSSOToken(tokenString, ssoCfg.ClientID)
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
		affiliations, batchFailures, err := fetchCharacterAffiliations(ctx, deps.ESI, request.AccountID, characterIDs)
		if err != nil {
			return err
		}
		failedCount += batchFailures

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

	allCorporations := make([]int64, 0, len(corpSet))
	for corpID := range corpSet {
		allCorporations = append(allCorporations, corpID)
	}
	allAlliances := make([]int64, 0, len(allianceSet))
	for aid := range allianceSet {
		allAlliances = append(allAlliances, aid)
	}

	sessions := plannersession.NewStore(deps.Redis)
	if err := sessions.PutCorporations(ctx, request.AccountID, allCorporations); err != nil {
		logs.ErrorCtx(ctx, "failed to store corporation IDs in Redis",
			"account_id", request.AccountID,
			"corporation_count", len(allCorporations),
			"error", err)
		return fmt.Errorf("failed to store corporations: %w", err)
	}
	if err := sessions.PutAlliances(ctx, request.AccountID, allAlliances); err != nil {
		logs.ErrorCtx(ctx, "failed to store alliance IDs in Redis",
			"account_id", request.AccountID,
			"alliance_count", len(allAlliances),
			"error", err)
		return fmt.Errorf("failed to store alliances: %w", err)
	}
	// The ids above become membership rows, and those rows are what a session may
	// reach: grants are resolved from them rather than from the ids directly, so
	// following a corporation is the same mechanism as being invited into a planner.
	//
	// Skipped when anything failed, because a partial affiliation lookup is not the
	// same answer as a smaller one: removing rows on an incomplete set would revoke
	// a member's access for the length of an outage. The rows are left as they are
	// and the next run reconciles them.
	if failedCount > 0 {
		logs.WarnCtx(ctx, "skipping membership reconcile: affiliation lookup was incomplete",
			"account_id", request.AccountID,
			"failed", failedCount)
	} else if err := reconcileEntityMemberships(ctx, deps, request.AccountID, allCorporations, allAlliances); err != nil {
		logs.WarnCtx(ctx, "failed to reconcile entity memberships",
			"account_id", request.AccountID,
			"error", err)
	}

	if err := taskrun.WriteSessionGrantsFromMemberships(ctx, deps, request.AccountID); err != nil {
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

// fetchCharacterAffiliations resolves character IDs to their corporation and
// alliance in batches, because ESI takes up to a thousand at a time.
//
// A batch that fails is counted and skipped rather than abandoning the rest: a
// partial answer still narrows what a session may see. A rate-limit refusal is
// the exception — it means come back later, so it stops the pass.
//
// This is backend work: a login sets it off, but nothing is waiting on the
// answer, so it takes the background lane and yields early under contention.
func fetchCharacterAffiliations(
	ctx context.Context,
	client esiclient.API,
	accountID string,
	characterIDs []int,
) ([]esiclient.CharacterAffiliation, int, error) {
	if client == nil {
		return nil, 0, fmt.Errorf("ESI client is nil")
	}

	var out []esiclient.CharacterAffiliation
	failed := 0

	for start := 0; start < len(characterIDs); start += maxCharacterAffiliationBatch {
		end := min(start+maxCharacterAffiliationBatch, len(characterIDs))
		chunk := characterIDs[start:end]

		payload, err := jsoncodec.Marshal(chunk)
		if err != nil {
			logs.ErrorCtx(ctx, "failed to marshal character ID batch for affiliation",
				"account_id", accountID, "batch_size", len(chunk), "error", err)
			failed += len(chunk)
			continue
		}

		resp, err := client.Do(ctx, esiclient.Request{
			Method: http.MethodPost,
			Path:   "/characters/affiliation/",
			Query:  url.Values{"datasource": {"tranquility"}},
			Body:   payload,
			Class:  esiclient.ClassBackground,
			// A repeated affiliation lookup reads the same rows again; it changes
			// nothing, so it is safe to send twice.
			Retry: retryAffiliation(),
		})
		if err != nil {
			logs.ErrorCtx(ctx, "failed to fetch character affiliation from ESI API",
				"account_id", accountID, "batch_size", len(chunk), "error", err)

			// A rate-limit refusal means come back later, and it carries when.
			// Everything else costs this batch and no more.
			if esiclient.IsRateLimit(err) {
				logs.WarnCtx(ctx, "retryable rate limit error, returning error for retry",
					"account_id", accountID, "error", err)
				return nil, failed, fmt.Errorf("rate limited: %w", err)
			}

			failed += len(chunk)
			continue
		}

		if resp.Status != http.StatusOK {
			logs.WarnCtx(ctx, "ESI API returned non-200 status for affiliation",
				"account_id", accountID, "status_code", resp.Status, "batch_size", len(chunk))
			failed += len(chunk)
			continue
		}

		var affiliations []esiclient.CharacterAffiliation
		if err := jsoncodec.Unmarshal(resp.Body, &affiliations); err != nil {
			logs.ErrorCtx(ctx, "failed to parse affiliation response",
				"account_id", accountID, "batch_size", len(chunk), "error", err)
			failed += len(chunk)
			continue
		}
		out = append(out, affiliations...)
	}

	return out, failed, nil
}

// retryAffiliation repeats a batch that produced no answer. The lookup is a
// read, so sending it again is safe despite being a POST.
func retryAffiliation() httpclient.Retry {
	policy := httpclient.DefaultRetry()
	policy.Attempts = 4
	policy.NonIdempotent = true
	return policy
}

// reconcileEntityMemberships converts the entity ids ESI reported into owners and
// makes the account's entity-member rows match them.
//
// The two ways an id fails to become an owner are opposite, and the difference
// matters: one EVE reserves for its own corporations and this project has no use
// for, which entityOwners drops deliberately; the other is a conversion that did
// not work, which is fatal, because the resulting set would be missing an entity
// the account is genuinely in and reconciling on it would remove that membership.
func reconcileEntityMemberships(ctx context.Context, deps *taskrun.Dependencies, accountID string, corporations, alliances []int64) error {
	if deps.EntityCipher == nil {
		return fmt.Errorf("no entity cipher: cannot derive owner refs")
	}

	owners, skipped, err := entityOwners(deps.EntityCipher, corporations, alliances)
	if err != nil {
		return err
	}

	added, removed, err := deps.Mongo.ReconcileEntityMemberships(ctx, accountID, owners, time.Now().UTC())
	if err != nil {
		return err
	}
	if added > 0 || removed > 0 || skipped > 0 {
		logs.InfoCtx(ctx, "reconciled entity memberships",
			"account_id", accountID,
			"added", added,
			"removed", removed,
			"npc_corporations_skipped", skipped)
	}
	return nil
}

// entityOwners converts the entity ids ESI reported into owners, and reports how
// many were excluded.
//
// EVE's own corporations are excluded before they become owners. A membership row
// for one would put every character in a starter corporation into a single shared
// planner that nobody administers, which is not a planner in any sense this
// project means. It is checked here because the id is raw until it becomes a ref.
//
// EVE has no NPC alliances, so there is nothing to exclude among those.
func entityOwners(cipher *entityid.Cipher, corporations, alliances []int64) ([]models.Owner, int, error) {
	skipped := 0
	owners := make([]models.Owner, 0, len(corporations)+len(alliances))

	for _, kind := range []struct {
		ids    []int64
		encode func(int64) (string, error)
		owner  func(string) models.Owner
		skip   func(int64) bool
		label  string
	}{
		{corporations, cipher.Corporation, models.CorporationOwner, models.IsNPCCorporation, "corporation"},
		{alliances, cipher.Alliance, models.AllianceOwner, nil, "alliance"},
	} {
		for _, id := range kind.ids {
			if kind.skip != nil && kind.skip(id) {
				skipped++
				continue
			}
			ref, err := kind.encode(id)
			if err != nil {
				return nil, skipped, fmt.Errorf("derive %s ref for %d: %w", kind.label, id, err)
			}
			owner := kind.owner(ref)
			if owner.IsZero() {
				return nil, skipped, fmt.Errorf("%s ref for %d yields no owner", kind.label, id)
			}
			owners = append(owners, owner)
		}
	}
	return owners, skipped, nil
}
