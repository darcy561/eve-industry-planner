package v1endpoints

import (
	"net/http"
	"strings"

	"eve-industry-planner/api/v1endpoints/groups"
	"eve-industry-planner/shared/shared"
	"eve-industry-planner/shared/logs"
)

func GroupsRouter(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	ctx := r.Context()
	path := r.URL.Path

	switch {
	case path == "/api/v1/groups" || path == "/api/v1/groups/":
		switch r.Method {
		case http.MethodGet:
			groups.GetGroupsHandler(w, r, clients)
		case http.MethodPut:
			groups.PutGroupsHandler(w, r, clients)
		case http.MethodDelete:
			groups.DeleteGroupsHandler(w, r, clients)
		default:
			logs.WarnCtx(ctx, "invalid method for groups collection")
			http.Error(w, "Method not allowed. Use GET /api/v1/groups to retrieve all groups, PUT /api/v1/groups to upsert groups, or DELETE /api/v1/groups to delete groups", http.StatusMethodNotAllowed)
		}
	default:
		const prefix = "/api/v1/groups/"
		if strings.HasPrefix(path, prefix) && len(path) > len(prefix) {
			rest := strings.TrimSuffix(strings.TrimPrefix(path, prefix), "/")
			if rest != "" && !strings.Contains(rest, "/") {
				groups.GetGroupByIDHandler(w, r, clients, rest)
				return
			}
		}
		logs.WarnCtx(ctx, "groups route not found")
		http.Error(w, "Not found", http.StatusNotFound)
	}
}
