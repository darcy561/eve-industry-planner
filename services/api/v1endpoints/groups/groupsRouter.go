package groups

import (
	"net/http"
	"strings"

	"eve-industry-planner/api/helper"
)

// Router handles all /api/v1/groups routes.
func (h *Handlers) Router(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Path

	switch {
	case path == "/api/v1/groups" || path == "/api/v1/groups/":
		switch r.Method {
		case http.MethodGet:
			h.GetGroupsHandler(w, r)
		case http.MethodPut:
			h.PutGroupsHandler(w, r)
		case http.MethodDelete:
			h.DeleteGroupsHandler(w, r)
		default:
			helper.RespondEndpointError(w, r, http.StatusMethodNotAllowed, "Method not allowed. Use GET /api/v1/groups to retrieve all groups, PUT /api/v1/groups to upsert groups, or DELETE /api/v1/groups to delete groups", "invalid method for groups collection", "groups_method_not_allowed", "groups", nil, map[string]interface{}{"method": r.Method})
		}
	default:
		const prefix = "/api/v1/groups/"
		if strings.HasPrefix(path, prefix) && len(path) > len(prefix) {
			rest := strings.TrimSuffix(strings.TrimPrefix(path, prefix), "/")
			if rest != "" && !strings.Contains(rest, "/") {
				h.GetGroupByIDHandler(w, r, rest)
				return
			}
		}
		helper.RespondEndpointError(w, r, http.StatusNotFound, "Not found", "groups route not found", "groups_not_found", "groups", nil, map[string]interface{}{"path": path})
	}
}
