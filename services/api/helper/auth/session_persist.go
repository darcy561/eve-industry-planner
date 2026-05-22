package auth

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/redis/go-redis/v9"
)

// VerifyAccountSessionPersisted confirms session_id is present under account_sessions for accountID.
func VerifyAccountSessionPersisted(ctx context.Context, redisClient *redis.Client, accountID, sessionID string) error {
	acc := strings.TrimSpace(accountID)
	sid := strings.TrimSpace(sessionID)
	if acc == "" || sid == "" {
		return errors.New("account_id and session_id are required")
	}
	if redisClient == nil {
		return errors.New("redis client is nil")
	}
	resolvedAccount, sess, err := ResolveAccountSessionBySessionID(ctx, redisClient, sid)
	if err != nil {
		return fmt.Errorf("session verify failed: %w", err)
	}
	if strings.TrimSpace(resolvedAccount) != acc {
		return errors.New("session verify failed: account mismatch")
	}
	if sess == nil {
		return errors.New("session verify failed: session missing")
	}
	if sess.RevokedAt != nil {
		return errors.New("session verify failed: session revoked")
	}
	return nil
}

// RevokeRefreshTokenBestEffort deletes a planner refresh token row when present (rotation rollback).
func RevokeRefreshTokenBestEffort(ctx context.Context, redisClient *redis.Client, token string) {
	if redisClient == nil || strings.TrimSpace(token) == "" {
		return
	}
	_ = RevokeRefreshToken(ctx, redisClient, token)
}

// RevokeRefreshTokensForLogout removes planner refresh credentials for logout: the presented
// token and any other refresh row indexed for the same session_id (stale cookie vs current index).
func RevokeRefreshTokensForLogout(ctx context.Context, redisClient *redis.Client, presentedToken, sessionID string) error {
	if redisClient == nil {
		return errors.New("redis client is nil")
	}
	presented := strings.TrimSpace(presentedToken)
	if presented == "" {
		return nil
	}
	if err := RevokeRefreshToken(ctx, redisClient, presented); err != nil {
		return err
	}
	sid := strings.TrimSpace(sessionID)
	if sid == "" {
		return nil
	}
	indexed, err := getSessionRefreshIndexToken(ctx, redisClient, sid)
	if err != nil {
		return err
	}
	if indexed != "" && indexed != presented {
		if err := RevokeRefreshToken(ctx, redisClient, indexed); err != nil {
			return err
		}
	}
	scanned, err := findRefreshTokenBySessionIDScan(ctx, redisClient, sid)
	if err != nil {
		return err
	}
	if scanned != "" && scanned != presented {
		return RevokeRefreshToken(ctx, redisClient, scanned)
	}
	return nil
}
