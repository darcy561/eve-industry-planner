package documentlocks

import (
	"net/http"

	"eve-industry-planner/shared/core/documentlock"
	"eve-industry-planner/shared"
)

func handleViewerArrived(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	hc, ok := lockHandlerContextOK(w, r, clients.Redis)
	if !ok {
		return
	}

	documentlock.HandleViewerArrivedIngress(hc.Ctx, documentlock.DepsFromServiceClients(clients), hc.AccountID, hc.SessionID, hc.Collection, hc.DocID)
	w.WriteHeader(http.StatusNoContent)
}

func handleViewerDeparted(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	hc, ok := lockHandlerContextOK(w, r, clients.Redis)
	if !ok {
		return
	}

	documentlock.HandleViewerDepartedIngress(hc.Ctx, documentlock.DepsFromServiceClients(clients), hc.AccountID, hc.SessionID, hc.Collection, hc.DocID)
	w.WriteHeader(http.StatusNoContent)
}
