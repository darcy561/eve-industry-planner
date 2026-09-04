package user

import (
	"context"
	"fmt"
	"time"

	"eve-industry-planner/shared/crypto/aesgcm"
	evesso "eve-industry-planner/shared/evesso"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// BuildCloudLinkedCharactersForLogin refreshes each stored additional-character ESI token
// server-side, returns short-lived access sessions for the client, encrypts refresh material at rest,
// and persists the user document when ciphertext or rotated refresh tokens change.
func (h *Handlers) BuildCloudLinkedCharactersForLogin(
	ctx context.Context,
	accountID string,
	user *models.UserAccountDocument,
	clientID, clientSecret string,
	kr *aesgcm.Keyring,
) ([]models.LinkedCharacterSession, error) {
	if h.Mongo == nil || accountID == "" || user == nil || kr == nil {
		return nil, fmt.Errorf("invalid args for BuildCloudLinkedCharactersForLogin")
	}
	if clientID == "" || clientSecret == "" {
		return nil, fmt.Errorf("EVE SSO client credentials are required for cloud login sessions")
	}

	ctx, cancel := context.WithTimeout(ctx, 45*time.Second)
	defer cancel()

	out := make([]models.LinkedCharacterSession, 0, len(user.RefreshTokens))
	dirty := false

	for i := range user.RefreshTokens {
		row := &user.RefreshTokens[i]
		if row.CharacterHash == "" {
			continue
		}
		plain, err := row.PlainRefreshMaterial(kr)
		if err != nil {
			logs.WarnCtx(ctx, "skip refresh token row for login sessions",
				"character_hash", row.CharacterHash,
				"error", err,
			)
			continue
		}

		tok, err := evesso.RefreshEveSSOAccessToken(ctx, clientID, clientSecret, plain)
		h.ReportSSO(ctx, err)
		if err != nil {
			logs.WarnCtx(ctx, "cloud login session ESI refresh failed",
				"character_hash", row.CharacterHash,
				"error", err,
			)
			continue
		}

		newRefresh := tok.RefreshToken
		if newRefresh == "" {
			newRefresh = plain
		}
		if err := row.EncryptRefreshAtRest(newRefresh, kr); err != nil {
			return nil, fmt.Errorf("encrypt refresh token for %s: %w", row.CharacterHash, err)
		}
		dirty = true

		out = append(out, models.LinkedCharacterSession{
			CharacterHash: row.CharacterHash,
			AccessToken:   tok.AccessToken,
			TokenType:     tok.TokenType,
			ExpiresIn:     tok.ExpiresIn,
		})
	}

	if dirty {
		if err := h.Mongo.Users.PatchUserAccountFields(ctx, accountID, bson.M{
			"refreshTokens":      user.RefreshTokens,
			"_meta.lastModified": time.Now().UTC(),
		}, eipmongo.WithOpName(fmt.Sprintf("persist encrypted refresh tokens at login %s", accountID))); err != nil {
			return nil, fmt.Errorf("persist encrypted refresh tokens: %w", err)
		}
	}

	return out, nil
}

// StripRefreshTokensFromUserDocumentForClient removes refresh-token material from API responses.
func StripRefreshTokensFromUserDocumentForClient(user *models.UserAccountDocument) {
	if user == nil {
		return
	}
	user.StripRefreshTokenSecretsForTransport()
}
