package grouptemplates

import (
	"net/http"
	"strings"

	"eve-industry-planner/api/helper"
)

// Router handles /api/v1/group-templates and subpaths.
func (h *Handlers) Router(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimSuffix(r.URL.Path, "/")
	const base = "/api/v1/group-templates"

	switch {
	case path == base:
		switch r.Method {
		case http.MethodGet:
			h.GetCatalogHandler(w, r)
		case http.MethodPost:
			h.PostTemplateHandler(w, r)
		default:
			helper.RespondEndpointError(w, r, http.StatusMethodNotAllowed, "Method not allowed", "invalid method for group-templates root", "group_templates_method_not_allowed", "group_templates", nil, map[string]interface{}{"method": r.Method})
		}
	default:
		const prefix = base + "/"
		if !strings.HasPrefix(path, prefix) {
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
				h.GetPayloadFullHandler(w, r, tid)
			default:
				helper.RespondEndpointError(w, r, http.StatusMethodNotAllowed, "Method not allowed", "invalid method for group-templates full", "group_templates_method_not_allowed", "group_templates", nil, map[string]interface{}{"method": r.Method, "template_id": tid})
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
			h.GetCatalogEntryHandler(w, r, templateID)
		case http.MethodPatch:
			h.PatchTemplateHandler(w, r, templateID)
		case http.MethodDelete:
			h.DeleteTemplateHandler(w, r, templateID)
		default:
			helper.RespondEndpointError(w, r, http.StatusMethodNotAllowed, "Method not allowed", "invalid method for group-templates entry", "group_templates_method_not_allowed", "group_templates", nil, map[string]interface{}{"method": r.Method, "template_id": templateID})
		}
	}
}
