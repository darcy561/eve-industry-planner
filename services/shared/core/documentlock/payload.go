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
	return LockPayloadForRecord(expiresAtUnix, "")
}

// LockPayloadForRecord builds expiry/TTL JSON using the stored lease mode when known.
func LockPayloadForRecord(expiresAtUnix int64, leaseMode string) map[string]any {
	now := time.Now().Unix()
	secRem := int(expiresAtUnix - now)
	if secRem < 0 {
		secRem = 0
	}
	ttlSeconds := LockTTLSeconds()
	if leaseMode == LeaseModeSolo {
		ttlSeconds = int(SoloLockTTLSeconds())
	}
	out := map[string]any{
		"expiresAtUnix":    expiresAtUnix,
		"ttlSeconds":       ttlSeconds,
		"secondsRemaining": secRem,
	}
	if leaseMode != "" {
		out["leaseMode"] = leaseMode
	}
	return out
}
