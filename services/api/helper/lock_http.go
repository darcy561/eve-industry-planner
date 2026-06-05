package helper

import (
	"net/http"

	"eve-industry-planner/shared/core/documentlock"
	"eve-industry-planner/shared/logs"
)

// RespondLockHeldElsewhereJSON writes HTTP 409 with the standard document-lock
// conflict JSON body (`error`, `collection`, `rejected[]`).
func RespondLockHeldElsewhereJSON(w http.ResponseWriter, r *http.Request, collection string, rejected []documentlock.LockHeldElsewhereItem) {
	if rejected == nil {
		rejected = []documentlock.LockHeldElsewhereItem{}
	}
	logs.AttachClientFailureDetail(r, "document lock held elsewhere", endpointFailureDetail("lock_held_elsewhere", "", map[string]interface{}{
		"collection":     collection,
		"rejected_count": len(rejected),
	}))
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusConflict)
	_ = EncodeJSON(w, map[string]any{
		"error":      documentlock.ErrCodeLockHeldElsewhere,
		"collection": collection,
		"rejected":   rejected,
	})
}
