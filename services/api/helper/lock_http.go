package helper

import (
	"net/http"

	"eve-industry-planner/shared/core/documentlock"
)

// RespondLockHeldElsewhereJSON writes HTTP 409 with the standard document-lock
// conflict JSON body (`error`, `collection`, `rejected[]`).
func RespondLockHeldElsewhereJSON(w http.ResponseWriter, collection string, rejected []documentlock.LockHeldElsewhereItem) {
	if rejected == nil {
		rejected = []documentlock.LockHeldElsewhereItem{}
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusConflict)
	_ = EncodeJSON(w, map[string]any{
		"error":      documentlock.ErrCodeLockHeldElsewhere,
		"collection": collection,
		"rejected":   rejected,
	})
}
