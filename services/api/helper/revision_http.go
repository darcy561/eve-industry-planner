package helper

import (
	"net/http"

	"eve-industry-planner/shared/logs"
	eipmongo "eve-industry-planner/shared/mongo"
)

// ErrCodeRevisionConflict is the JSON `error` field for a write refused because
// the document moved under it.
//
// Distinct from a lock conflict: a lock says somebody is holding the document,
// a revision conflict says somebody has already written it. A client meeting
// this has a stale document rather than a blocked one.
const ErrCodeRevisionConflict = "revision_conflict"

// RevisionConflictItem is one refused document as it reaches a client.
//
// Gone tells a client the document was deleted rather than rewritten, which is
// the difference between reconciling against a newer version and having nothing
// to reconcile against. Always written, including when false: a client branches
// on it, and an absent flag would be one more state to decide about.
type RevisionConflictItem struct {
	// Named docID on the wire, as every other document-scoped payload in this
	// codebase is — the lock conflict beside it, the changestream and the lock
	// events. One endpoint answering two refusals should not name the same
	// document two ways.
	DocID    string `json:"docID"`
	Expected int64  `json:"expected"`
	Current  int64  `json:"current"`
	Gone     bool   `json:"gone"`
}

// RespondRevisionConflictJSON answers a batch in which at least one document was
// refused, naming every one of them and how many of the batch still landed.
//
// Always HTTP 409, whether or not part of the batch wrote: the status describes
// the request's outcome, and a request that did not do everything it asked for
// is not a success. `saved` is what stops that being read as nothing happened.
func RespondRevisionConflictJSON(w http.ResponseWriter, r *http.Request, collection string, saved int, conflicts []eipmongo.RevisionConflict) {
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
		"error":      ErrCodeRevisionConflict,
		"collection": collection,
		"saved":      saved,
		"rejected":   items,
	})
}
