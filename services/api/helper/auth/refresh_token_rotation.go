package auth

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/redis/go-redis/v9"
)

// ErrRefreshTokenGenerate indicates GenerateRefreshToken failed inside MintAndStoreRefreshToken.
var ErrRefreshTokenGenerate = errors.New("refresh token generate failed")

// PresentedRefreshResult is the resolved planner refresh credential for rotate/bootstrap.
type PresentedRefreshResult struct {
	Token               string
	Data                *RefreshTokenData
	RecoveredViaSession bool
}

// ResolvePresentedRefreshToken loads refresh_token:<presented>. When that row is missing and
// sessionID refers to an active account session, it resolves the current refresh row for that session.
func ResolvePresentedRefreshToken(ctx context.Context, redisClient *redis.Client, presentedToken, sessionID string) (PresentedRefreshResult, error) {
	presentedToken = strings.TrimSpace(presentedToken)
	out := PresentedRefreshResult{Token: presentedToken}

	data, err := GetRefreshTokenData(ctx, redisClient, presentedToken)
	if err == nil {
		out.Data = data
		return out, nil
	}
	if !errors.Is(err, ErrRefreshTokenNotFound) {
		return PresentedRefreshResult{}, err
	}

	sid := strings.TrimSpace(sessionID)
	if sid == "" {
		return PresentedRefreshResult{}, ErrRefreshTokenNotFound
	}
	resolvedToken, resolvedData, recErr := ResolveRefreshTokenForValidSession(ctx, redisClient, sid)
	if recErr != nil {
		return PresentedRefreshResult{}, recErr
	}
	return PresentedRefreshResult{
		Token:               resolvedToken,
		Data:                resolvedData,
		RecoveredViaSession: true,
	}, nil
}

// ResolvePresentedRefreshTokenFromRequest is ResolvePresentedRefreshToken with sessionID from eip_session.
func ResolvePresentedRefreshTokenFromRequest(ctx context.Context, redisClient *redis.Client, presentedToken string, r *http.Request) (PresentedRefreshResult, error) {
	sessionID := ""
	if r != nil {
		sessionID = ResolvePlannerSessionID(r)
	}
	return ResolvePresentedRefreshToken(ctx, redisClient, presentedToken, sessionID)
}

// MintAndStoreRefreshToken generates a new opaque planner refresh token and persists it in Redis.
func MintAndStoreRefreshToken(ctx context.Context, redisClient *redis.Client, data RefreshTokenData) (string, error) {
	token, err := GenerateRefreshToken()
	if err != nil {
		return "", fmt.Errorf("%w: %w", ErrRefreshTokenGenerate, err)
	}
	if err := StoreRefreshToken(ctx, redisClient, token, data); err != nil {
		return "", err
	}
	return token, nil
}

// RevokeSupersededRefreshToken removes the refresh token that was presented or recovered for rotation.
func RevokeSupersededRefreshToken(ctx context.Context, redisClient *redis.Client, supersededToken string) error {
	return RevokeRefreshToken(ctx, redisClient, supersededToken)
}

// UseAppRefreshCookieOnResponse reports whether rotate/bootstrap should set eip_app_refresh.
func UseAppRefreshCookieOnResponse(refreshFromCookie, recoveredViaSession bool) bool {
	return refreshFromCookie || recoveredViaSession
}

// ApplyRotatedSessionCookies is a no-op for per-tab sessions (identity via X-Session-ID / JSON body).
func ApplyRotatedSessionCookies(w http.ResponseWriter, r *http.Request, sessionID, newRefreshToken string, refreshFromCookie, recoveredViaSession bool) {
	_, _, _, _, _, _ = w, r, sessionID, newRefreshToken, refreshFromCookie, recoveredViaSession
}
