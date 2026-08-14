package cloudstoredesi

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"eve-industry-planner/shared/core/config"
	"eve-industry-planner/shared/core/evesso"
	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"

	"go.mongodb.org/mongo-driver/v2/bson"
	mongodriver "go.mongodb.org/mongo-driver/v2/mongo"
)

// RefreshStoredEsiForCharacter refreshes one encrypted refresh row by CharacterHash and persists the user document.
func RefreshStoredEsiForCharacter(ctx context.Context, mongo *eipmongo.Mongo, accountID, characterHash string, cfg *config.CloudStoredESI) (*evesso.EveSSOTokenPayload, error) {
	if cfg == nil {
		return nil, fmt.Errorf("cloud esi: config is nil")
	}
	if mongo == nil {
		return nil, fmt.Errorf("cloud esi: mongo handle is nil")
	}
	if strings.TrimSpace(accountID) == "" || strings.TrimSpace(characterHash) == "" {
		return nil, fmt.Errorf("cloud esi: account_id and character_hash required")
	}
	if cfg.Keys.Keyring == nil {
		return nil, ErrKeyring
	}

	usersCol := mongo.Users.Collection()
	if usersCol == nil {
		return nil, fmt.Errorf("cloud esi: users collection unavailable")
	}

	var userDoc models.UserAccountDocument
	if err := usersCol.FindOne(ctx, bson.M{"_id": accountID, "_meta.accountID": accountID}).Decode(&userDoc); err != nil {
		if errors.Is(err, mongodriver.ErrNoDocuments) {
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

	plain, err := row.PlainRefreshMaterial(cfg.Keys.Keyring)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrDecrypt, err)
	}

	refreshCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	tok, err := evesso.RefreshEveSSOAccessToken(refreshCtx, cfg.SSO.ClientID, cfg.SSO.ClientSecret, plain)
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
	if err := row.EncryptRefreshAtRest(newRefresh, cfg.Keys.Keyring); err != nil {
		return nil, fmt.Errorf("cloud esi: encrypt: %w", err)
	}

	if err := mongo.Users.PatchUserAccountFields(ctx, accountID, bson.M{
		"refreshTokens":      userDoc.RefreshTokens,
		"_meta.lastModified": time.Now().UTC(),
	}, eipmongo.WithOpName("persist cloud-stored ESI refresh rotation")); err != nil {
		return nil, fmt.Errorf("%w: %v", ErrPersist, err)
	}

	return tok, nil
}
