package planners

import (
	"net/http"
	"strings"

	"eve-industry-planner/api/helper"
)

// Router routes /api/v1/planners. Runs after the private middleware (rate limit,
// auth); see each handler for status codes.
func (h *Handlers) Router(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Path
	switch {
	case path == "/api/v1/planners" || path == "/api/v1/planners/":
		if r.Method != http.MethodGet {
			helper.RespondEndpointError(w, r, http.StatusMethodNotAllowed,
				"Method not allowed. Use GET /api/v1/planners",
				"invalid method for planners endpoint", "method_not_allowed", "planners", nil,
				map[string]any{"method": r.Method})
			return
		}
		h.GetPlannersHandler(w, r)

	// Join carries no owner handle: the caller holds no membership row yet, so
	// the guard the handle routes run would refuse them. The invite names the
	// planner instead.
	case path == "/api/v1/planners/join":
		if r.Method != http.MethodPost {
			helper.RespondEndpointError(w, r, http.StatusMethodNotAllowed,
				"Method not allowed. Use POST /api/v1/planners/join",
				"invalid method for planner join endpoint", "method_not_allowed", "planners", nil,
				map[string]any{"method": r.Method})
			return
		}
		h.PostPlannerJoinHandler(w, r)

	case strings.HasPrefix(path, "/api/v1/planners/"):
		// The handle is the rest of the path rather than one segment: an owner
		// key is `kind:id`, and the id of an entity kind is a ref that carries no
		// slash but is not worth assuming a shape for.
		rest := strings.TrimSuffix(strings.TrimPrefix(path, "/api/v1/planners/"), "/")

		if handle, found := strings.CutSuffix(rest, "/settings"); found {
			if handle == "" || strings.Contains(handle, "/") {
				helper.RespondEndpointError(w, r, http.StatusNotFound, "Not found",
					"planners route not found", "planners_not_found", "planners", nil,
					map[string]any{"path": path})
				return
			}
			switch r.Method {
			case http.MethodGet:
				h.GetPlannerSettingsHandler(w, r, handle)
			case http.MethodPut:
				h.PutPlannerSettingsHandler(w, r, handle)
			default:
				helper.RespondEndpointError(w, r, http.StatusMethodNotAllowed,
					"Method not allowed. Use GET or PUT /api/v1/planners/{owner}/settings",
					"invalid method for planner settings endpoint", "method_not_allowed", "planners", nil,
					map[string]any{"method": r.Method})
			}
			return
		}

		if handle, found := strings.CutSuffix(rest, "/invites"); found {
			h.routeInvites(w, r, handle, "")
			return
		}
		if handle, inviteID, found := cutInvitePath(rest); found {
			h.routeInvites(w, r, handle, inviteID)
			return
		}

		if rest == "" || strings.Contains(rest, "/") {
			helper.RespondEndpointError(w, r, http.StatusNotFound, "Not found",
				"planners route not found", "planners_not_found", "planners", nil,
				map[string]any{"path": path})
			return
		}
		if r.Method != http.MethodPut {
			helper.RespondEndpointError(w, r, http.StatusMethodNotAllowed,
				"Method not allowed. Use PUT /api/v1/planners/{owner}",
				"invalid method for planner endpoint", "method_not_allowed", "planners", nil,
				map[string]any{"method": r.Method})
			return
		}
		h.PutPlannerHandler(w, r, rest)

	default:
		helper.RespondEndpointError(w, r, http.StatusNotFound, "Not found",
			"planners route not found", "planners_not_found", "planners", nil,
			map[string]any{"path": path})
	}
}

// cutInvitePath splits `{handle}/invites/{inviteID}` into its two ends.
func cutInvitePath(rest string) (handle, inviteID string, found bool) {
	handle, tail, found := strings.Cut(rest, "/invites/")
	if !found || handle == "" || tail == "" || strings.Contains(tail, "/") {
		return "", "", false
	}
	return handle, tail, true
}

// routeInvites serves the invite routes under one planner. An empty inviteID
// means the collection rather than one invite.
func (h *Handlers) routeInvites(w http.ResponseWriter, r *http.Request, handle, inviteID string) {
	if handle == "" || strings.Contains(handle, "/") {
		helper.RespondEndpointError(w, r, http.StatusNotFound, "Not found",
			"planners route not found", "planners_not_found", "planners", nil,
			map[string]any{"path": r.URL.Path})
		return
	}

	if inviteID != "" {
		if r.Method != http.MethodDelete {
			helper.RespondEndpointError(w, r, http.StatusMethodNotAllowed,
				"Method not allowed. Use DELETE /api/v1/planners/{owner}/invites/{inviteID}",
				"invalid method for planner invite endpoint", "method_not_allowed", "planners", nil,
				map[string]any{"method": r.Method})
			return
		}
		h.DeletePlannerInviteHandler(w, r, handle, inviteID)
		return
	}

	switch r.Method {
	case http.MethodGet:
		h.GetPlannerInvitesHandler(w, r, handle)
	case http.MethodPost:
		h.PostPlannerInviteHandler(w, r, handle)
	default:
		helper.RespondEndpointError(w, r, http.StatusMethodNotAllowed,
			"Method not allowed. Use GET or POST /api/v1/planners/{owner}/invites",
			"invalid method for planner invites endpoint", "method_not_allowed", "planners", nil,
			map[string]any{"method": r.Method})
	}
}
