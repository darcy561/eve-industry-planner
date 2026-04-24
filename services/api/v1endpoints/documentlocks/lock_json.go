package documentlocks

import (
	"encoding/json"
	"net/http"
	"time"
)

type extendExtras struct {
	handoffPending       bool
	probeTargetSessionID string
	probeExpiresAtUnix   int64
	cycleReset           bool
}

func writeExtendJSON(w http.ResponseWriter, status int, expUnix int64, extendCount int, x extendExtras) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	payload := lockPayload(expUnix)
	payload["holding"] = true
	payload["extendCount"] = extendCount
	payload["handoffPending"] = x.handoffPending
	if x.probeTargetSessionID != "" {
		payload["probeTargetSessionID"] = x.probeTargetSessionID
	}
	if x.probeExpiresAtUnix > 0 {
		payload["probeExpiresAtUnix"] = x.probeExpiresAtUnix
	}
	if x.cycleReset {
		payload["cycleReset"] = true
	}
	_ = json.NewEncoder(w).Encode(payload)
}

// lockTTLSeconds is the wall-clock segment length each acquire/extend/rebind applies (matches Redis key TTL).
func lockTTLSeconds() int {
	return int(DefaultLockTTL / time.Second)
}

func lockPayload(expiresAtUnix int64) map[string]any {
	now := time.Now().Unix()
	secRem := int(expiresAtUnix - now)
	if secRem < 0 {
		secRem = 0
	}
	return map[string]any{
		"expiresAtUnix":    expiresAtUnix,
		"ttlSeconds":       lockTTLSeconds(),
		"secondsRemaining": secRem,
	}
}
