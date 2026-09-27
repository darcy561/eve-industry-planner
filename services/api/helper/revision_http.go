package helper

import (
	"net/http"

	"eve-industry-planner/shared/logs"
	eipmongo "eve-industry-planner/shared/mongo"
)

// ErrCodeRevisionConflict is the JSON `error` field for a write refused because
// the document moved under it.
const ErrCodeRevisionConflict = "revision_conflict"

// RevisionConflictItem is one refused document as it reaches a client.
type RevisionConflictItem struct {
	// Named docID on the wire, as every other document-scoped payload in this
	// codebase is.
	DocID    string `json:"docID"`
	Expected int64  `json:"expected"`
	Current  int64  `json:"current"`
	Gone     bool   `json:"gone"`
}

// RespondRevisionConflictJSON answers a batch in which at least one document was
// refused, naming every one of them and how many of the batch still landed.
func RespondRevisionConflictJSON(w http.ResponseWriter, r *http.Request, collection string, saved int, savedDocIDs []string, conflicts []eipmongo.RevisionConflict) {
	if savedDocIDs == nil {
		savedDocIDs = []string{}
	}
	items := make([]RevisionConflictItem, 0, len(conflicts))
	for _, c := range conflicts {
		items = append(items, RevisionConflictItem{
			DocID:    c.JobID,
			Expected: c.Expected,
			Current:  c.Current,
			Gone:     c.Gone,
		})
	}
	logs.AttachClientFailureDetail(r, "document revision conflict", endpointFailureDetail("revision_conflict", "", map[string]any{
		"collection":     collection,
		"rejected_count": len(items),
		"saved":          saved,
	}))
	_ = EncodeJSONStatus(w, http.StatusConflict, map[string]any{
		"error":       ErrCodeRevisionConflict,
		"collection":  collection,
		"saved":       saved,
		"savedDocIDs": savedDocIDs,
		"rejected":    items,
	})
}
