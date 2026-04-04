package auth

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"regexp"
	"time"

	rediscore "eve-industry-planner/shared/core/redis"
	"eve-industry-planner/shared/shared/logs"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

const (
	// RefreshTokenTTL is how long refresh tokens are valid (7 days)
	RefreshTokenTTL = 7 * 24 * time.Hour
	// RefreshTokenKeyPrefix is the Redis key prefix for refresh tokens
	RefreshTokenKeyPrefix = "refresh_token:"
	// CorporationKeyPrefix is the Redis key prefix for storing corporation IDs by account ID
	CorporationKeyPrefix = "custom_claims_corporations:"
	// CorporationTTL is how long corporation IDs are cached (30 days)
	CorporationTTL = 30 * 24 * time.Hour
)

// RefreshTokenData stores the metadata associated with a refresh token
type RefreshTokenData struct {
	CharacterHash string         `json:"character_hash"`
	AccountID     string         `json:"account_id"`
	Scopes        []string       `json:"scopes"`
	Corporations  CorporationIDs `json:"corporations,omitempty"` // Corporation IDs the user can access
}

// GenerateRefreshToken generates a secure random refresh token
func GenerateRefreshToken() (string, error) {
	// Generate a UUID for the token
	u, err := uuid.NewRandom()
	if err != nil {
		// Fallback to random bytes if UUID fails
		bytes := make([]byte, 32)
		if _, err := rand.Reader.Read(bytes); err != nil {
			return "", fmt.Errorf("failed to generate refresh token: %w", err)
		}
		return base64.URLEncoding.EncodeToString(bytes), nil
	}
	return u.String(), nil
}

// StoreRefreshToken stores a refresh token in Redis with associated user data
func StoreRefreshToken(ctx context.Context, redisClient *redis.Client, token string, data RefreshTokenData) error {
	key := RefreshTokenKeyPrefix + token
	if err := rediscore.SaveJSON(ctx, redisClient, key, data, RefreshTokenTTL); err != nil {
		return fmt.Errorf("failed to store refresh token: %w", err)
	}
	return nil
}

// GetRefreshTokenData retrieves refresh token data from Redis
func GetRefreshTokenData(ctx context.Context, redisClient *redis.Client, token string) (*RefreshTokenData, error) {
	key := RefreshTokenKeyPrefix + token

	var data RefreshTokenData
	err := rediscore.GetJSON(ctx, redisClient, key, &data)
	if err == redis.Nil {
		return nil, errors.New("refresh token not found")
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get refresh token: %w", err)
	}

	return &data, nil
}

// RevokeRefreshToken removes a refresh token from Redis
func RevokeRefreshToken(ctx context.Context, redisClient *redis.Client, token string) error {
	key := RefreshTokenKeyPrefix + token
	return redisClient.Del(ctx, key).Err()
}

// StoreCorporations stores corporation IDs for an account ID in Redis
// AccountID should be the same for all characters belonging to the same internal account
func StoreCorporations(ctx context.Context, redisClient *redis.Client, accountID string, corporationIDs []int64) error {
	if accountID == "" {
		return errors.New("account ID cannot be empty")
	}

	key := CorporationKeyPrefix + accountID
	if err := rediscore.SaveJSON(ctx, redisClient, key, corporationIDs, CorporationTTL); err != nil {
		return fmt.Errorf("failed to store corporation IDs: %w", err)
	}

	return nil
}

// GetCorporations retrieves corporation IDs for an account ID from Redis
// Returns all corporations for all characters belonging to that account
// Returns empty array on error or if not found (errors are logged internally)
func GetCorporations(ctx context.Context, redisClient *redis.Client, accountID string) []int64 {
	if accountID == "" {
		return []int64{}
	}

	key := CorporationKeyPrefix + accountID

	var corporationIDs []int64
	err := rediscore.GetJSON(ctx, redisClient, key, &corporationIDs)
	if err == redis.Nil {
		// No corporations stored yet, return empty slice
		return []int64{}
	}
	if err != nil {
		// Log error but return empty array - don't fail the request
		logs.Debug("failed to get corporation IDs from Redis", "error", err, "account_id", accountID)
		return []int64{}
	}

	return corporationIDs
}

// GetAccountIDFromCharacterHash extracts AccountID from a character hash
// This is the same logic used in GenerateInternalJWT
func GetAccountIDFromCharacterHash(characterHash string) string {
	alphanumericRegex := regexp.MustCompile(`[^a-zA-Z0-9]`)
	return alphanumericRegex.ReplaceAllString(characterHash, "")
}
