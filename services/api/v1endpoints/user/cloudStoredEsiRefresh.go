package user

import (
	"context"
	"encoding/json"
	"errors"
	"eve-industry-planner/shared/stackservices"
	"fmt"
	"net/http"
	"strings"
	"time"

	"eve-industry-planner/api/helper"
	cloudstoredesi "eve-industry-planner/api/helper/cloudstoredesi"
	"eve-industry-planner/shared/core/config"
	evesso "eve-industry-planner/shared/core/evesso"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/telemetry/apimetrics"
)

// Sentinel errors for RefreshStoredEsiFromMongoForCharacter / planner session refresh (cookie resume).
var (
	ErrMongoStoredEsiUserNotFound = cloudstoredesi.ErrUserNotFound
	ErrMongoStoredEsiNotCloud     = cloudstoredesi.ErrNotCloud
	ErrMongoStoredEsiNoRow        = cloudstoredesi.ErrNoRow
	ErrMongoStoredEsiKeyring      = cloudstoredesi.ErrKeyring
	ErrMongoStoredEsiDecrypt      = cloudstoredesi.ErrDecrypt
	ErrMongoStoredEsiInvalidGrant = cloudstoredesi.ErrInvalidGrant
	ErrMongoStoredEsiPersist      = cloudstoredesi.ErrPersist
)

// RefreshStoredEsiFromMongoForCharacter refreshes EVE OAuth tokens using encrypted Mongo users.refreshTokens
// material for the given character hash, then persists rotation. Used when the planner session refresh
// request has no client eve_token but a valid HttpOnly app refresh cookie (cloud cookie resume).
// Returns the new ESI access token string for optional inclusion in the bootstrap session JSON (avoids a second CCP round-trip).
func RefreshStoredEsiFromMongoForCharacter(ctx context.Context, clients *stackservices.Clients, accountID, characterHash string) (esiAccessToken string, err error) {
	tok, err := refreshStoredEsiFromMongo(ctx, clients, accountID, strings.TrimSpace(characterHash))
	if err != nil {
		return "", err
	}
	if tok == nil {
		return "", errors.New("mongo stored esi: nil token response")
	}
	return tok.AccessToken, nil
}

func refreshStoredEsiFromMongo(ctx context.Context, clients *stackservices.Clients, accountID, targetHash string) (*evesso.EveSSOTokenPayload, error) {
	cfg, err := config.LoadCloudStoredESI()
	if err != nil {
		return nil, fmt.Errorf("mongo stored esi: %w", err)
	}

	return cloudstoredesi.RefreshStoredEsiForCharacter(ctx, clients.Mongo, accountID, targetHash, &cfg)
}

// ServerStoredEsiAccessTokenHandler handles POST /api/v1/esi/characters/access-token/server:
// refreshes ESI access using Mongo-held OAuth refresh for the character hash (cloud / server storage mode).
// No long-lived refresh secret is returned to the client.
func ServerStoredEsiAccessTokenHandler(w http.ResponseWriter, r *http.Request, clients *stackservices.Clients) {
	ctx := r.Context()
	start := helper.RequestStartOrNow(ctx)
	m := apimetrics.GetAPIEveSSOTokenRefresh()

	if !helper.RequireMethod(w, r, http.MethodPost) {
		m.Errors.WithLabelValues("method_not_allowed").Inc(ctx)
		return
	}

	accountID := helper.AuthenticatedAccountID(r)

	var req struct {
		CharacterHash        string `json:"character_hash"`
		ClientAccessTokenExp int64  `json:"client_access_token_exp,omitempty"`
	}
	if err := helper.DecodeJSONRequest(r, &req, 2048); err != nil {
		m.Errors.WithLabelValues("extraction_error").Inc(ctx)
		helper.RespondEndpointError(w, r, http.StatusBadRequest, err.Error(), "cloud stored ESI refresh: invalid request body", "linked_esi_bad_request", "eve_sso_token_refresh", err, nil)
		return
	}
	targetHash := strings.TrimSpace(req.CharacterHash)
	if targetHash == "" {
		m.Errors.WithLabelValues("validation_error").Inc(ctx)
		helper.RespondEndpointError(w, r, http.StatusBadRequest, "character_hash is required", "cloud stored ESI refresh: missing character_hash", "linked_esi_missing_character_hash", "eve_sso_token_refresh", nil, nil)
		return
	}

	logs.AttachDebugStep(r, "character_hash_received", map[string]interface{}{
		"character_hash":          targetHash,
		"client_access_token_exp": req.ClientAccessTokenExp,
	})

	tok, err := refreshStoredEsiFromMongo(ctx, clients, accountID, targetHash)
	if err != nil {
		switch {
		case errors.Is(err, ErrMongoStoredEsiUserNotFound):
			m.Errors.WithLabelValues("not_found").Inc(ctx)
			helper.RespondEndpointError(w, r, http.StatusNotFound, "user document not found", "cloud stored ESI refresh: user not found", "linked_esi_user_not_found", "eve_sso_token_refresh", err, map[string]interface{}{"character_hash": targetHash})
		case errors.Is(err, ErrMongoStoredEsiNotCloud):
			m.Errors.WithLabelValues("forbidden").Inc(ctx)
			helper.RespondEndpointError(w, r, http.StatusForbidden, "cloud storage mode is not enabled", "cloud stored ESI refresh: not cloud mode", "linked_esi_not_cloud", "eve_sso_token_refresh", err, map[string]interface{}{"character_hash": targetHash})
		case errors.Is(err, ErrMongoStoredEsiNoRow):
			m.Errors.WithLabelValues("forbidden").Inc(ctx)
			helper.RespondEndpointError(w, r, http.StatusForbidden, "character not linked for this account", "cloud stored ESI refresh: character not linked", "linked_esi_character_not_linked", "eve_sso_token_refresh", err, map[string]interface{}{"character_hash": targetHash})
		case errors.Is(err, ErrMongoStoredEsiKeyring):
			m.Errors.WithLabelValues("config_error").Inc(ctx)
			helper.RespondEndpointServerError(w, r, "Internal server error", "linked esi keyring", "linked_esi_keyring", "eve_sso_token_refresh", err, map[string]interface{}{
				"additional_chars_endpoint": "esi_server_access_token",
				"character_hash":            targetHash,
			})
		case errors.Is(err, ErrMongoStoredEsiDecrypt):
			m.Errors.WithLabelValues("extraction_error").Inc(ctx)
			helper.RespondEndpointServerError(w, r, "stored refresh token unavailable", "linked esi decrypt", "linked_esi_decrypt", "eve_sso_token_refresh", err, map[string]interface{}{
				"additional_chars_endpoint": "esi_server_access_token",
				"character_hash":            targetHash,
			})
		case errors.Is(err, ErrMongoStoredEsiInvalidGrant):
			m.Errors.WithLabelValues("sso_refresh_error").Inc(ctx)
			helper.RespondEndpointError(w, r, http.StatusBadRequest, "Invalid refresh token", "cloud stored ESI refresh: invalid grant", "linked_esi_invalid_grant", "eve_sso_token_refresh", err, map[string]interface{}{"character_hash": targetHash})
		case errors.Is(err, ErrMongoStoredEsiPersist):
			m.Errors.WithLabelValues("database_error").Inc(ctx)
			helper.RespondEndpointServerError(w, r, "Internal server error", "linked esi persist mongo", "linked_esi_persist_mongo", "eve_sso_token_refresh", err, map[string]interface{}{
				"additional_chars_endpoint": "esi_server_access_token",
				"character_hash":            targetHash,
			})
		default:
			if strings.Contains(err.Error(), "invalid_grant") || strings.Contains(err.Error(), "invalid_request") {
				m.Errors.WithLabelValues("sso_refresh_error").Inc(ctx)
				helper.RespondEndpointError(w, r, http.StatusBadRequest, "Invalid refresh token", "cloud stored ESI refresh: invalid grant (upstream)", "linked_esi_invalid_grant", "eve_sso_token_refresh", err, map[string]interface{}{"character_hash": targetHash})
			} else if strings.Contains(err.Error(), "encrypt") {
				m.Errors.WithLabelValues("encode_error").Inc(ctx)
				helper.RespondEndpointServerError(w, r, "Internal server error", "linked esi encrypt rotation", "linked_esi_encrypt_rotation", "eve_sso_token_refresh", err, map[string]interface{}{
					"additional_chars_endpoint": "esi_server_access_token",
					"character_hash":            targetHash,
				})
			} else {
				m.Errors.WithLabelValues("database_error").Inc(ctx)
				helper.RespondEndpointError(w, r, http.StatusBadGateway, "Failed to refresh token", "linked esi upstream refresh", "linked_esi_upstream_refresh", "eve_sso_token_refresh", err, map[string]interface{}{
					"additional_chars_endpoint": "esi_server_access_token",
					"character_hash":            targetHash,
				})
			}
		}
		return
	}

	logs.AttachDebugStep(r, "esi_refreshed_from_mongo", map[string]interface{}{
		"expires_in": tok.ExpiresIn,
	})

	resp := *tok
	resp.RefreshToken = ""
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Pragma", "no-cache")
	w.WriteHeader(http.StatusOK)
	if err := json.NewEncoder(w).Encode(resp); err != nil {
		m.Errors.WithLabelValues("encode_error").Inc(ctx)
		helper.RespondEndpointServerError(w, r, "Internal server error", "failed to encode cloud-stored ESI refresh response", "linked_esi_encode_failed", "eve_sso_token_refresh", err, map[string]interface{}{
			"character_hash": targetHash,
		})
		return
	}

	duration := time.Since(start)
	m.Requests.Observe(ctx, apimetrics.DurationMilliseconds(duration))
	m.RequestsCount.Inc(ctx)
	m.Successes.Inc(ctx)
	logs.AttachHandlerSuccessDetail(r, "cloud stored ESI access token refreshed", map[string]interface{}{
		"character_hash": targetHash,
		"duration_ms":    duration.Milliseconds(),
	})
}
