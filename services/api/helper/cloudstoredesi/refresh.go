package cloudstoredesi

import (
	"context"
	"fmt"
	"strings"
	"time"

	"eve-industry-planner/shared/core/config"
	"eve-industry-planner/shared/core/evesso"
	mongoput "eve-industry-planner/shared/core/mongo/put"
	"eve-industry-planner/shared/shared/models"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
)

// RefreshStoredEsiForCharacter refreshes one encrypted refresh row by CharacterHash and persists the user document.
func RefreshStoredEsiForCharacter(ctx context.Context, usersCol *mongo.Collection, accountID, characterHash string, cfg *config.Config) (*evesso.EveSSOTokenPayload, error) {
	if cfg == nil {
		return nil, fmt.Errorf("cloud esi: config is nil")
	}
	if strings.TrimSpace(accountID) == "" || strings.TrimSpace(characterHash) == "" {
		return nil, fmt.Errorf("cloud esi: account_id and character_hash required")
	}
	if cfg.RefreshTokenKeyring == nil {
		return nil, ErrKeyring
	}

	var userDoc models.UserAccountDocument
	if err := usersCol.FindOne(ctx, bson.M{"_id": accountID, "_meta.accountID": accountID}).Decode(&userDoc); err != nil {
		if err == mongo.ErrNoDocuments {
			return nil, ErrUserNotFound
		}
		return nil, fmt.Errorf("cloud esi: %w", err)
	}
	if !userDoc.UserCloudAccounts {
		return nil, ErrNotCloud
	}

	var row *models.RefreshToken
	for i := range userDoc.RefreshTokens {
		if strings.EqualFold(userDoc.RefreshTokens[i].CharacterHash, characterHash) {
			row = &userDoc.RefreshTokens[i]
			break
		}
	}
	if row == nil {
		return nil, ErrNoRow
	}

	plain, err := row.PlainRefreshMaterial(cfg.RefreshTokenKeyring)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrDecrypt, err)
	}

	refreshCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	tok, err := evesso.RefreshEveSSOAccessToken(refreshCtx, cfg.EveSSOClientID, cfg.EveSSOClientSecret, plain)
	if err != nil {
		if strings.Contains(err.Error(), "invalid_grant") || strings.Contains(err.Error(), "invalid_request") {
			return nil, fmt.Errorf("%w: %v", ErrInvalidGrant, err)
		}
		return nil, fmt.Errorf("cloud esi: %w", err)
	}

	newRefresh := tok.RefreshToken
	if newRefresh == "" {
		newRefresh = plain
	}
	if err := row.EncryptRefreshAtRest(newRefresh, cfg.RefreshTokenKeyring); err != nil {
		return nil, fmt.Errorf("cloud esi: encrypt: %w", err)
	}

	if err := mongoput.PatchUserAccountFields(ctx, usersCol, accountID, bson.M{
		"refreshTokens":      userDoc.RefreshTokens,
		"_meta.lastModified": time.Now().UTC(),
	}, "persist cloud-stored ESI refresh rotation"); err != nil {
		return nil, fmt.Errorf("%w: %v", ErrPersist, err)
	}

	return tok, nil
}
