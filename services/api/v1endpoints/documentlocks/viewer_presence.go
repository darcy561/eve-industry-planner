package documentlocks

import (
	"eve-industry-planner/shared/stackservices"
	"net/http"

	"eve-industry-planner/shared/core/documentlock"
	"eve-industry-planner/shared/logs"
)

func handleViewerArrived(w http.ResponseWriter, r *http.Request, clients *stackservices.Clients) {
	hc, ok := lockHandlerContextOK(w, r, clients.Redis)
	if !ok {
		return
	}

	documentlock.HandleViewerArrivedIngress(hc.Ctx, documentlock.DepsFromClients(clients), hc.AccountID, hc.SessionID, hc.Collection, hc.DocID)
	logs.AttachDebugStep(r, "viewer_presence_updated", lockDebugExtra(hc, map[string]interface{}{"event": "arrived"}))
	finishLockHandlerSuccess(r, "viewer-arrived", http.StatusNoContent, hc, nil)
	w.WriteHeader(http.StatusNoContent)
}

func handleViewerDeparted(w http.ResponseWriter, r *http.Request, clients *stackservices.Clients) {
	hc, ok := lockHandlerContextOK(w, r, clients.Redis)
	if !ok {
		return
	}

	documentlock.HandleViewerDepartedIngress(hc.Ctx, documentlock.DepsFromClients(clients), hc.AccountID, hc.SessionID, hc.Collection, hc.DocID)
	logs.AttachDebugStep(r, "viewer_presence_updated", lockDebugExtra(hc, map[string]interface{}{"event": "departed"}))
	finishLockHandlerSuccess(r, "viewer-departed", http.StatusNoContent, hc, nil)
	w.WriteHeader(http.StatusNoContent)
}
