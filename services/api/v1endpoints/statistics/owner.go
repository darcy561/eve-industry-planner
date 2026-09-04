package statistics

import (
	"context"
	"fmt"
	"net/http"
	"strings"

	"eve-industry-planner/api/helper"
	"eve-industry-planner/shared/models"
)

// The path names whose statistics are read, as an owner handle: `account:{id}`
// today. A handle differs from the stored owner key only for the ESI kinds,
// whose key holds a ref rather than the raw id a client may see.

type ownerContextKey struct{}

// parseOwnerHandle reads `kind:id`; the id may contain a colon, so only the
// first separates the two.
func parseOwnerHandle(segment string) (models.StatsOwner, error) {
	kind, id, found := strings.Cut(segment, ":")
	if !found {
		return models.StatsOwner{}, fmt.Errorf("owner handle %q must be kind:id", segment)
	}
	if id == "" {
		return models.StatsOwner{}, fmt.Errorf("owner handle %q names no owner", segment)
	}
	return models.StatsOwner{Kind: models.StatsOwnerKind(kind), ID: id}, nil
}

func withRequestOwner(r *http.Request, owner models.StatsOwner) *http.Request {
	return r.WithContext(context.WithValue(r.Context(), ownerContextKey{}, owner))
}

// requestOwner is the owner the path named, or the zero owner on a request that
// did not come through the router.
func requestOwner(r *http.Request) models.StatsOwner {
	owner, _ := r.Context().Value(ownerContextKey{}).(models.StatsOwner)
	return owner
}

// requireOwnedBySession answers true when the session may read the owner the
// path named.
//
// In the handler rather than the router: it compares against the session the
// auth middleware resolved, and rejecting earlier would answer 403 where these
// routes answer 401. An account may read only itself until shared planners make
// this a grant lookup.
func requireOwnedBySession(w http.ResponseWriter, r *http.Request, metrics *helper.RequestMetricsTracker, view, accountID string) bool {
	owner := requestOwner(r)
	if owner.Kind == models.StatsOwnerAccount && owner.ID == accountID {
		return true
	}
	metrics.Error("owner_forbidden")
	helper.RespondEndpointError(w, r, http.StatusForbidden, "Forbidden",
		"statistics: session may not read this owner", "statistics_owner_forbidden", view, nil,
		map[string]any{"owner_kind": string(owner.Kind)})
	return false
}
