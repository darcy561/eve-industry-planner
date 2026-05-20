package documentlocks

import (
	"encoding/json"
	"net/http"

	"eve-industry-planner/shared/core/documentlock"
)

func writeExtendJSON(w http.ResponseWriter, status int, expUnix int64, extendCount int, x documentlock.ExtendExtras) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	payload := documentlock.LockPayload(expUnix)
	payload["holding"] = true
	payload["extendCount"] = extendCount
	payload["handoffPending"] = x.HandoffPending
	if x.ProbeTargetSessionID != "" {
		payload["probeTargetSessionID"] = x.ProbeTargetSessionID
	}
	if x.ProbeExpiresAtUnix > 0 {
		payload["probeExpiresAtUnix"] = x.ProbeExpiresAtUnix
	}
	if x.CycleReset {
		payload["cycleReset"] = true
	}
	_ = json.NewEncoder(w).Encode(payload)
}
