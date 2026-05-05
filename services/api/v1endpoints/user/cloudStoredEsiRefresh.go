package user

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"eve-industry-planner/api/helper"
	"eve-industry-planner/api/helper/auth"
	cloudstoredesi "eve-industry-planner/api/helper/cloudstoredesi"
	"eve-industry-planner/shared/core/config"
	evesso "eve-industry-planner/shared/core/evesso"
	mongocore "eve-industry-planner/shared/core/mongo"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/shared"
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
// Returns the new ESI access token string for optional inclusion in the login-refresh JSON (avoids a second CCP round-trip).
func RefreshStoredEsiFromMongoForCharacter(ctx context.Context, clients *shared.ServiceClients, accountID, characterHash string) (esiAccessToken string, err error) {
	tok, err := refreshStoredEsiFromMongo(ctx, clients, accountID, strings.TrimSpace(characterHash))
	if err != nil {
		return "", err
	}
	if tok == nil {
		return "", errors.New("mongo stored esi: nil token response")
	}
	return tok.AccessToken, nil
}

func refreshStoredEsiFromMongo(ctx context.Context, clients *shared.ServiceClients, accountID, targetHash string) (*evesso.EveSSOTokenPayload, error) {
	cfg, err := config.LoadConfig()
	if err != nil {
		return nil, fmt.Errorf("mongo stored esi: %w", err)
	}

	database := clients.Mongo.Database(mongocore.DatabaseName)
	usersCol := database.Collection(mongocore.CollectionUsers)
	return cloudstoredesi.RefreshStoredEsiForCharacter(ctx, usersCol, accountID, targetHash, &cfg)
}

// CloudStoredEsiRefreshHandler refreshes a cloud-stored character's ESI access token server-side
// (Mongo users.refreshTokens row by CharacterHash — main or linked alt when present).
// No ESI refresh token is returned to the client.
func CloudStoredEsiRefreshHandler(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	ctx := r.Context()
	start := helper.RequestStartOrNow(ctx)
	m := apimetrics.GetAPIEveSSOTokenRefresh()

	if !helper.RequireMethod(w, r, http.MethodPost) {
		m.Errors.WithLabelValues("method_not_allowed").Inc(ctx)
		return
	}

	claims, err := auth.ExtractInternalClaims(r)
	if err != nil {
		m.Errors.WithLabelValues("auth_error").Inc(ctx)
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	accountID := claims.AccountID

	var req struct {
		CharacterHash        string `json:"character_hash"`
		ClientAccessTokenExp int64  `json:"client_access_token_exp,omitempty"`
	}
	if err := helper.DecodeJSONRequest(r, &req, 2048); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	targetHash := strings.TrimSpace(req.CharacterHash)
	if targetHash == "" {
		http.Error(w, "character_hash is required", http.StatusBadRequest)
		return
	}

	tok, err := refreshStoredEsiFromMongo(ctx, clients, accountID, targetHash)
	if err != nil {
		switch {
		case errors.Is(err, ErrMongoStoredEsiUserNotFound):
			http.Error(w, "user document not found", http.StatusNotFound)
		case errors.Is(err, ErrMongoStoredEsiNotCloud):
			http.Error(w, "cloud storage mode is not enabled", http.StatusForbidden)
		case errors.Is(err, ErrMongoStoredEsiNoRow):
			http.Error(w, "character not linked for this account", http.StatusForbidden)
		case errors.Is(err, ErrMongoStoredEsiKeyring):
			m.Errors.WithLabelValues("config_error").Inc(ctx)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
		case errors.Is(err, ErrMongoStoredEsiDecrypt):
			m.Errors.WithLabelValues("extraction_error").Inc(ctx)
			http.Error(w, "stored refresh token unavailable", http.StatusInternalServerError)
		case errors.Is(err, ErrMongoStoredEsiInvalidGrant):
			m.Errors.WithLabelValues("sso_refresh_error").Inc(ctx)
			http.Error(w, "Invalid refresh token", http.StatusBadRequest)
		case errors.Is(err, ErrMongoStoredEsiPersist):
			m.Errors.WithLabelValues("database_error").Inc(ctx)
			logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Internal server error", err)
		default:
			if strings.Contains(err.Error(), "invalid_grant") || strings.Contains(err.Error(), "invalid_request") {
				m.Errors.WithLabelValues("sso_refresh_error").Inc(ctx)
				http.Error(w, "Invalid refresh token", http.StatusBadRequest)
			} else if strings.Contains(err.Error(), "encrypt") {
				m.Errors.WithLabelValues("encode_error").Inc(ctx)
				logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Internal server error", err)
			} else {
				m.Errors.WithLabelValues("database_error").Inc(ctx)
				logs.RespondHTTPError(w, r, http.StatusBadGateway, "Failed to refresh token", err)
			}
		}
		return
	}

	resp := *tok
	resp.RefreshToken = ""
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Pragma", "no-cache")
	w.WriteHeader(http.StatusOK)
	if err := json.NewEncoder(w).Encode(resp); err != nil {
		m.Errors.WithLabelValues("encode_error").Inc(ctx)
		logs.ErrorCtx(ctx, "failed to encode cloud-stored ESI refresh response", "error", err)
		return
	}

	duration := time.Since(start)
	m.Requests.Observe(ctx, apimetrics.DurationMilliseconds(duration))
	m.RequestsCount.Inc(ctx)
	m.Successes.Inc(ctx)
}
