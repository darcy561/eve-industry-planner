package documentlock

import "time"

// ExtendExtras carries optional fields for /extend JSON responses.
type ExtendExtras struct {
	HandoffPending       bool
	ProbeTargetSessionID string
	ProbeExpiresAtUnix   int64
	CycleReset           bool
}

// LockTTLSeconds is the wall-clock segment length each acquire/extend/rebind applies (matches Redis key TTL).
func LockTTLSeconds() int {
	return int(DefaultLockTTL / time.Second)
}

// LockPayload builds the standard expiry/TTL fragment for JSON responses.
func LockPayload(expiresAtUnix int64) map[string]any {
	now := time.Now().Unix()
	secRem := int(expiresAtUnix - now)
	if secRem < 0 {
		secRem = 0
	}
	return map[string]any{
		"expiresAtUnix":    expiresAtUnix,
		"ttlSeconds":       LockTTLSeconds(),
		"secondsRemaining": secRem,
	}
}
