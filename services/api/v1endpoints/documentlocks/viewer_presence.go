package documentlocks

import (
	"net/http"

	"eve-industry-planner/shared/core/documentlock"
	"eve-industry-planner/shared/logs"
)

func (h *Handlers) handleViewerArrived(w http.ResponseWriter, r *http.Request) {
	hc, ok := lockHandlerContextOK(w, r, h.Redis)
	if !ok {
		return
	}

	documentlock.HandleViewerArrivedIngress(hc.Ctx, h.LockDeps(), hc.AccountID, hc.SessionID, hc.Collection, hc.DocID)
	logs.AttachDebugStep(r, "viewer_presence_updated", lockDebugExtra(hc, map[string]any{"event": "arrived"}))
	finishLockHandlerSuccess(r, "viewer-arrived", http.StatusNoContent, hc, nil)
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handlers) handleViewerDeparted(w http.ResponseWriter, r *http.Request) {
	hc, ok := lockHandlerContextOK(w, r, h.Redis)
	if !ok {
		return
	}

	documentlock.HandleViewerDepartedIngress(hc.Ctx, h.LockDeps(), hc.AccountID, hc.SessionID, hc.Collection, hc.DocID)
	logs.AttachDebugStep(r, "viewer_presence_updated", lockDebugExtra(hc, map[string]any{"event": "departed"}))
	finishLockHandlerSuccess(r, "viewer-departed", http.StatusNoContent, hc, nil)
	w.WriteHeader(http.StatusNoContent)
}
