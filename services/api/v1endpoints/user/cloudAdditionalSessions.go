package user

import (
	"context"
	"fmt"
	"time"

	corecrypto "eve-industry-planner/shared/core/crypto"
	evesso "eve-industry-planner/shared/core/evesso"
	mongocore "eve-industry-planner/shared/core/mongo"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/shared/models"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
)

// BuildCloudLinkedCharactersForLogin refreshes each stored additional-character ESI token
// server-side, returns short-lived access sessions for the client, encrypts refresh material at rest,
// and persists the user document when ciphertext or rotated refresh tokens change.
func BuildCloudLinkedCharactersForLogin(
	ctx context.Context,
	db *mongo.Client,
	accountID string,
	user *models.UserAccountDocument,
	clientID, clientSecret string,
	kr *corecrypto.Keyring,
) ([]models.LinkedCharacterSession, error) {
	if db == nil || accountID == "" || user == nil || kr == nil {
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
		collection := db.Database(mongocore.DatabaseName).Collection(mongocore.CollectionUsers)
		retryCfg := mongocore.DefaultRetryConfig()
		retryCfg.OperationName = fmt.Sprintf("persist encrypted refresh tokens at login %s", accountID)
		if err := mongocore.RetryMongoOperation(ctx, retryCfg, func() error {
			_, err := collection.UpdateOne(ctx, bson.M{"_id": accountID, "_meta.accountID": accountID}, bson.M{
				"$set": bson.M{
					"refreshTokens":      user.RefreshTokens,
					"_meta.lastModified": time.Now().UTC(),
				},
			})
			return err
		}); err != nil {
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
