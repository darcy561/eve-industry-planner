package grouptemplates

import (
	"net/http"
	"strings"

	"eve-industry-planner/api/helper"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/shared"
)

// Router handles /api/v1/group-templates and subpaths.
func Router(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	ctx := r.Context()
	path := strings.TrimSuffix(r.URL.Path, "/")
	const base = "/api/v1/group-templates"

	switch {
	case path == base:
		switch r.Method {
		case http.MethodGet:
			GetCatalogHandler(w, r, clients)
		case http.MethodPost:
			PostTemplateHandler(w, r, clients)
		default:
			logs.WarnCtx(ctx, "invalid method for group-templates root")
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	default:
		const prefix = base + "/"
		if !strings.HasPrefix(path, prefix) {
			logs.WarnCtx(ctx, "group-templates route not found")
			helper.RespondNotFound(w, r, nil)
			return
		}
		rest := strings.TrimPrefix(path, prefix)
		if rest == "" {
			helper.RespondNotFound(w, r, nil)
			return
		}
		// .../full
		if strings.HasSuffix(rest, "/full") {
			tid := strings.TrimSuffix(rest, "/full")
			if tid == "" || strings.Contains(tid, "/") {
				helper.RespondNotFound(w, r, nil)
				return
			}
			switch r.Method {
			case http.MethodGet:
				GetPayloadFullHandler(w, r, clients, tid)
			default:
				http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			}
			return
		}
		if strings.Contains(rest, "/") {
			helper.RespondNotFound(w, r, nil)
			return
		}
		templateID := rest
		switch r.Method {
		case http.MethodGet:
			GetCatalogEntryHandler(w, r, clients, templateID)
		case http.MethodPatch:
			PatchTemplateHandler(w, r, clients, templateID)
		case http.MethodDelete:
			DeleteTemplateHandler(w, r, clients, templateID)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	}
}
