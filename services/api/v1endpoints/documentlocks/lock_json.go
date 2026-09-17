package documentlocks

import (
	"net/http"

	"eve-industry-planner/api/helper"
	"eve-industry-planner/shared/core/documentlock"
)

func writeExtendJSON(w http.ResponseWriter, status int, expUnix int64, extendCount int, x documentlock.ExtendExtras) {
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
	_ = helper.EncodeJSONStatus(w, status, payload)
}
