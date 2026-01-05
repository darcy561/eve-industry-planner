package v1endpoints

import (
	"net/http"

	"eve-industry-planner/api/api/v1endpoints/groups"
	"eve-industry-planner/shared/shared"
)

func GroupsRouter(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	path := r.URL.Path

	switch {
	case path == "/v1/groups" || path == "/v1/groups/":
		switch r.Method {
		case http.MethodGet:
			groups.GetGroupsHandler(w, r, clients)
		case http.MethodPut:
			groups.PutGroupsHandler(w, r, clients)
		case http.MethodDelete:
			groups.DeleteGroupsHandler(w, r, clients)
		default:
			http.Error(w, "Method not allowed. Use GET /v1/groups to retrieve all groups, POST /v1/groups to create a new group, PUT /v1/groups to update a group, or DELETE /v1/groups to delete a group", http.StatusMethodNotAllowed)
		}
	}
}
