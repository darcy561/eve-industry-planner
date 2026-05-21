package auth

import (
	"context"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
)

// ReauthDeadlineFromSessionStart is when periodic full SSO is required for this planner session chain.
// It is anchored at login/bootstrap SessionStart and must not move on rotate/bootstrap.
func ReauthDeadlineFromSessionStart(sessionStart time.Time) time.Time {
	if sessionStart.IsZero() {
		return time.Time{}
	}
	return sessionStart.UTC().Add(RefreshTokenTTL)
}

// ReauthDeadline returns the effective periodic-SSO deadline from session start and/or stored reauth_required_at.
// When both are set, the earlier time applies (strictest policy for divergent legacy rows).
func ReauthDeadline(sessionStart, reauthRequiredAt time.Time) time.Time {
	fromStart := ReauthDeadlineFromSessionStart(sessionStart)
	if reauthRequiredAt.IsZero() {
		return fromStart
	}
	r := reauthRequiredAt.UTC()
	if fromStart.IsZero() {
		return r
	}
	if r.Before(fromStart) {
		return r
	}
	return fromStart
}

// ReauthRequiredAtUnix is the API-facing unix seconds for reauth_required_at (0 when unknown).
func ReauthRequiredAtUnix(sessionStart, reauthRequiredAt time.Time) int64 {
	d := ReauthDeadline(sessionStart, reauthRequiredAt)
	if d.IsZero() {
		return 0
	}
	return d.Unix()
}

// IsReauthExpired reports whether now is past the effective reauth deadline (After, not >=).
func IsReauthExpired(sessionStart, reauthRequiredAt, now time.Time) bool {
	deadline := ReauthDeadline(sessionStart, reauthRequiredAt)
	if deadline.IsZero() {
		return false
	}
	return now.UTC().After(deadline)
}

// IsPlannerSessionReauthExpired reports whether the refresh-token chain SessionStart window has passed.
func IsPlannerSessionReauthExpired(sessionStart, now time.Time) bool {
	return IsReauthExpired(sessionStart, time.Time{}, now)
}

// IsRefreshTokenDataReauthExpired checks the refresh-token SessionStart and, when session_id is set,
// the matching account_sessions row so rotate/bootstrap and middleware agree.
func IsRefreshTokenDataReauthExpired(ctx context.Context, redisClient *redis.Client, token *RefreshTokenData, now time.Time) bool {
	if token == nil {
		return false
	}
	if IsReauthExpired(token.SessionStart, time.Time{}, now) {
		return true
	}
	sid := strings.TrimSpace(token.SessionID)
	if sid == "" || redisClient == nil {
		return false
	}
	sess, err := loadAccountSessionRow(ctx, redisClient, sid)
	if err != nil || sess == nil {
		return false
	}
	return IsReauthExpired(sess.StartedAt, sess.ReauthRequiredAt, now)
}
