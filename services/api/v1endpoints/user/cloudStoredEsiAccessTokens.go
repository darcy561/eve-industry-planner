package user

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"eve-industry-planner/api/helper"
	cloudstoredesi "eve-industry-planner/api/helper/cloudstoredesi"
	"eve-industry-planner/shared/core/config"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/telemetry/apimetrics"
)

// maxAccessTokenBatch bounds one request. An account holds far fewer characters than this; the cap
// is here so a malformed or hostile body cannot ask the server for an unbounded number of EVE SSO
// exchanges in one go.
const maxAccessTokenBatch = 50

type serverStoredAccessTokensRequest struct {
	CharacterHashes []string `json:"character_hashes"`
}

// serverStoredAccessToken is one character's outcome. A character whose credential is dead carries
// an Error and no token, so one bad row does not deny the rest of the batch.
type serverStoredAccessToken struct {
	CharacterHash string `json:"character_hash"`
	AccessToken   string `json:"access_token,omitempty"`
	TokenType     string `json:"token_type,omitempty"`
	ExpiresIn     int    `json:"expires_in,omitzero"`
	Error         string `json:"error,omitempty"`
}

type serverStoredAccessTokensResponse struct {
	Tokens []serverStoredAccessToken `json:"tokens"`
}

// ServerStoredEsiAccessTokensHandler handles POST /api/v1/esi/characters/access-tokens/server:
// ESI access tokens for several characters at once, from Mongo-held OAuth refresh material.
//
// The plural form exists because acquiring per character costs a document read and a document write
// each; a page that wants tokens for a whole roster would otherwise issue that many of both.
// No long-lived refresh secret is returned to the client.
func (h *Handlers) ServerStoredEsiAccessTokensHandler(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	start := helper.RequestStartOrNow(ctx)
	m := apimetrics.GetAPIEveSSOTokenRefresh()

	if !helper.RequireMethod(w, r, http.MethodPost) {
		m.Errors.WithLabelValues("method_not_allowed").Inc(ctx)
		return
	}

	accountID := helper.AuthenticatedAccountID(r)

	var req serverStoredAccessTokensRequest
	if err := helper.DecodeJSONRequest(r, &req, 8192); err != nil {
		m.Errors.WithLabelValues("extraction_error").Inc(ctx)
		helper.RespondEndpointError(w, r, http.StatusBadRequest, err.Error(), "cloud stored ESI batch refresh: invalid request body", "linked_esi_bad_request", "eve_sso_token_refresh", err, nil)
		return
	}

	hashes := make([]string, 0, len(req.CharacterHashes))
	for _, hash := range req.CharacterHashes {
		if trimmed := strings.TrimSpace(hash); trimmed != "" {
			hashes = append(hashes, trimmed)
		}
	}
	if len(hashes) == 0 {
		m.Errors.WithLabelValues("validation_error").Inc(ctx)
		helper.RespondEndpointError(w, r, http.StatusBadRequest, "character_hashes is required", "cloud stored ESI batch refresh: no character hashes", "linked_esi_missing_character_hash", "eve_sso_token_refresh", nil, nil)
		return
	}
	if len(hashes) > maxAccessTokenBatch {
		m.Errors.WithLabelValues("validation_error").Inc(ctx)
		helper.RespondEndpointError(w, r, http.StatusBadRequest, "too many character_hashes", "cloud stored ESI batch refresh: batch too large", "linked_esi_batch_too_large", "eve_sso_token_refresh", nil, map[string]any{
			"requested": len(hashes),
			"maximum":   maxAccessTokenBatch,
		})
		return
	}

	cfg, err := config.LoadCloudStoredESI()
	if err != nil {
		m.Errors.WithLabelValues("config_error").Inc(ctx)
		helper.RespondEndpointServerError(w, r, "Internal server error", "cloud stored ESI batch refresh: config", "linked_esi_config", "eve_sso_token_refresh", err, nil)
		return
	}

	results, err := cloudstoredesi.RefreshStoredEsiForCharacters(ctx, h.Mongo, accountID, hashes, &cfg,
		func(err error) { h.ReportSSO(ctx, err) })
	if err != nil {
		// Only a whole-account failure reaches here; a single character's is carried in its Result.
		switch {
		case errors.Is(err, cloudstoredesi.ErrUserNotFound):
			m.Errors.WithLabelValues("not_found").Inc(ctx)
			helper.RespondEndpointError(w, r, http.StatusNotFound, "user document not found", "cloud stored ESI batch refresh: user not found", "linked_esi_user_not_found", "eve_sso_token_refresh", err, nil)
		case errors.Is(err, cloudstoredesi.ErrNotCloud):
			m.Errors.WithLabelValues("forbidden").Inc(ctx)
			helper.RespondEndpointError(w, r, http.StatusForbidden, "cloud storage mode is not enabled", "cloud stored ESI batch refresh: not cloud mode", "linked_esi_not_cloud", "eve_sso_token_refresh", err, nil)
		case errors.Is(err, cloudstoredesi.ErrKeyring):
			m.Errors.WithLabelValues("config_error").Inc(ctx)
			helper.RespondEndpointServerError(w, r, "Internal server error", "cloud stored ESI batch refresh: keyring", "linked_esi_keyring", "eve_sso_token_refresh", err, nil)
		case errors.Is(err, cloudstoredesi.ErrPersist):
			m.Errors.WithLabelValues("database_error").Inc(ctx)
			helper.RespondEndpointServerError(w, r, "Internal server error", "cloud stored ESI batch refresh: persist", "linked_esi_persist_mongo", "eve_sso_token_refresh", err, nil)
		default:
			m.Errors.WithLabelValues("database_error").Inc(ctx)
			helper.RespondEndpointError(w, r, http.StatusBadGateway, "Failed to refresh tokens", "cloud stored ESI batch refresh failed", "linked_esi_upstream_refresh", "eve_sso_token_refresh", err, nil)
		}
		return
	}

	resp := serverStoredAccessTokensResponse{Tokens: make([]serverStoredAccessToken, 0, len(results))}
	refreshed := 0
	for _, result := range results {
		row := serverStoredAccessToken{CharacterHash: result.CharacterHash}
		if result.Err != nil {
			row.Error = result.Err.Error()
		} else {
			row.AccessToken = result.Token.AccessToken
			row.TokenType = result.Token.TokenType
			row.ExpiresIn = result.Token.ExpiresIn
			refreshed++
		}
		resp.Tokens = append(resp.Tokens, row)
	}

	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Pragma", "no-cache")
	if err := helper.EncodeJSONStatus(w, http.StatusOK, resp); err != nil {
		m.Errors.WithLabelValues("encode_error").Inc(ctx)
		helper.RespondEndpointServerError(w, r, "Internal server error", "failed to encode cloud-stored ESI batch response", "linked_esi_encode_failed", "eve_sso_token_refresh", err, nil)
		return
	}

	duration := time.Since(start)
	m.Requests.Observe(ctx, apimetrics.DurationMilliseconds(duration))
	m.RequestsCount.Inc(ctx)
	m.Successes.Inc(ctx)
	logs.AttachHandlerSuccessDetail(r, "cloud stored ESI access tokens refreshed", map[string]any{
		"requested":   len(hashes),
		"refreshed":   refreshed,
		"duration_ms": duration.Milliseconds(),
	})
}
