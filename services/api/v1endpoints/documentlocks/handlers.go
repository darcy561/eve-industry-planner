package documentlocks

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"

	"eve-industry-planner/api/helper"
	"eve-industry-planner/shared/core/documentlock"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/shared"
)

type lockBody struct {
	Collection string `json:"collection"`
	DocID      string `json:"docID"`
}

func parseLockBody(r *http.Request) (lockBody, error) {
	var b lockBody
	if err := helper.DecodeJSONRequest(r, &b, helper.DefaultMaxBodySize); err != nil {
		return b, err
	}
	if b.Collection == "" || b.DocID == "" {
		return b, fmt.Errorf("collection and docID required")
	}
	return b, nil
}

func lockService(clients *shared.ServiceClients) *documentlock.Service {
	return documentlock.NewService(documentlock.DepsFromServiceClients(clients))
}

func handleAcquire(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	hc, ok := lockHandlerContextOK(w, r, clients.Redis)
	if !ok {
		return
	}
	out, err := lockService(clients).Acquire(hc.Ctx, hc.AccountID, hc.SessionID, hc.Collection, hc.DocID)
	if err != nil {
		if errors.Is(err, documentlock.ErrLocksUnavailable) {
			helper.RespondEndpointError(w, r, http.StatusServiceUnavailable, "Locks unavailable", "document locks unavailable", "doc_lock_unavailable", "document_lock_acquire", err, map[string]interface{}{
				"account_id": hc.AccountID, "collection": hc.Collection, "doc_id": hc.DocID,
			})
			return
		}
		helper.RespondEndpointServerError(w, r, "Internal error", "doc lock acquire failed", "doc_lock_acquire_failed", "document_lock_acquire", err, map[string]interface{}{
			"account_id": hc.AccountID, "collection": hc.Collection, "doc_id": hc.DocID,
		})
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(out.StatusCode)
	_ = json.NewEncoder(w).Encode(out.Payload)
}

func handleExtend(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	hc, ok := lockHandlerContextOK(w, r, clients.Redis)
	if !ok {
		return
	}
	out, err := lockService(clients).Extend(hc.Ctx, hc.AccountID, hc.SessionID, hc.Collection, hc.DocID)
	if err != nil {
		if errors.Is(err, documentlock.ErrLocksUnavailable) {
			helper.RespondEndpointError(w, r, http.StatusServiceUnavailable, "Locks unavailable", "document locks unavailable", "doc_lock_unavailable", "document_lock_extend", err, map[string]interface{}{
				"account_id": hc.AccountID, "collection": hc.Collection, "doc_id": hc.DocID,
			})
			return
		}
		helper.RespondEndpointServerError(w, r, "Internal error", "doc lock extend failed", "doc_lock_extend_failed", "document_lock_extend", err, map[string]interface{}{
			"account_id": hc.AccountID, "collection": hc.Collection, "doc_id": hc.DocID,
		})
		return
	}
	if out.NotHolderPayload != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(out.StatusCode)
		_ = json.NewEncoder(w).Encode(out.NotHolderPayload)
		return
	}
	writeExtendJSON(w, out.StatusCode, out.ExpiresAtUnix, out.ExtendCount, out.Extras)
}

func handleRelease(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	hc, ok := lockHandlerContextOK(w, r, clients.Redis)
	if !ok {
		return
	}
	err := lockService(clients).Release(hc.Ctx, hc.AccountID, hc.SessionID, hc.Collection, hc.DocID)
	if err != nil {
		if errors.Is(err, documentlock.ErrLocksUnavailable) {
			helper.RespondEndpointError(w, r, http.StatusServiceUnavailable, "Locks unavailable", "document locks unavailable", "doc_lock_unavailable", "document_lock_release", err, map[string]interface{}{
				"account_id": hc.AccountID, "collection": hc.Collection, "doc_id": hc.DocID,
			})
			return
		}
		helper.RespondEndpointServerError(w, r, "Internal error", "doc lock release failed", "doc_lock_release_failed", "document_lock_release", err, map[string]interface{}{
			"account_id": hc.AccountID, "collection": hc.Collection, "doc_id": hc.DocID,
		})
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func handleForceRelease(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	hc, ok := lockHandlerContextOK(w, r, clients.Redis)
	if !ok {
		return
	}
	prevHolder, err := lockService(clients).ForceReleaseSameAccount(hc.Ctx, hc.AccountID, hc.SessionID, hc.Collection, hc.DocID)
	if err != nil {
		if errors.Is(err, documentlock.ErrLocksUnavailable) {
			http.Error(w, "Locks unavailable", http.StatusServiceUnavailable)
			return
		}
		if errors.Is(err, documentlock.ErrForceReleaseNoLock) {
			http.Error(w, "No active lock", http.StatusNotFound)
			return
		}
		if errors.Is(err, documentlock.ErrForceReleaseSameSession) {
			http.Error(w, "Already holding lock; use POST /release", http.StatusBadRequest)
			return
		}
		helper.RespondEndpointServerError(w, r, "Internal error", "doc lock force-release failed", "doc_lock_force_release_failed", "document_lock_force_release", err, map[string]interface{}{
			"account_id": hc.AccountID, "collection": hc.Collection, "doc_id": hc.DocID,
		})
		return
	}
	logs.InfoCtx(hc.Ctx, "document_lock_force_release",
		"accountID", hc.AccountID,
		"collection", hc.Collection,
		"docID", hc.DocID,
		"requesterSessionID", hc.SessionID,
		"previousHolderSessionID", prevHolder,
	)
	w.WriteHeader(http.StatusNoContent)
}

func handleHandOver(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	hc, ok := lockHandlerContextOK(w, r, clients.Redis)
	if !ok {
		return
	}
	res, err := lockService(clients).HandOver(hc.Ctx, hc.AccountID, hc.SessionID, hc.Collection, hc.DocID)
	if err != nil {
		if errors.Is(err, documentlock.ErrLocksUnavailable) {
			http.Error(w, "Locks unavailable", http.StatusServiceUnavailable)
			return
		}
		helper.RespondEndpointServerError(w, r, "Internal error", "doc lock hand over failed", "doc_lock_handover_failed", "document_lock_handover", err, map[string]interface{}{
			"account_id": hc.AccountID, "collection": hc.Collection, "doc_id": hc.DocID,
		})
		return
	}
	if res.Payload != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(res.StatusCode)
		_ = json.NewEncoder(w).Encode(res.Payload)
		return
	}
	w.WriteHeader(res.StatusCode)
}

func handleRequest(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	hc, ok := lockHandlerContextOK(w, r, clients.Redis)
	if !ok {
		return
	}
	res, err := lockService(clients).RequestAccess(hc.Ctx, hc.AccountID, hc.SessionID, hc.Collection, hc.DocID)
	if err != nil {
		if errors.Is(err, documentlock.ErrLocksUnavailable) {
			http.Error(w, "Locks unavailable", http.StatusServiceUnavailable)
			return
		}
		helper.RespondEndpointServerError(w, r, "Internal error", "doc lock request access failed", "doc_lock_request_failed", "document_lock_request", err, map[string]interface{}{
			"account_id": hc.AccountID, "collection": hc.Collection, "doc_id": hc.DocID,
		})
		return
	}
	if res.Payload != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(res.StatusCode)
		_ = json.NewEncoder(w).Encode(res.Payload)
		return
	}
	w.WriteHeader(res.StatusCode)
}

func handleLockState(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	ctx := r.Context()
	accountID, ok := helper.RequireAccountID(w, r)
	if !ok {
		return
	}
	collection := r.URL.Query().Get("collection")
	docID := r.URL.Query().Get("docID")
	if collection == "" || docID == "" {
		http.Error(w, "collection and docID query params required", http.StatusBadRequest)
		return
	}
	if clients.Redis == nil {
		http.Error(w, "Locks unavailable", http.StatusServiceUnavailable)
		return
	}
	payload, err := documentlock.StatusPayloadForDoc(ctx, clients.Redis, accountID, collection, docID)
	if err != nil {
		helper.RespondEndpointServerError(w, r, "Internal error", "document lock state failed", "doc_lock_state_failed", "document_lock_state", err, map[string]interface{}{
			"account_id": accountID, "collection": collection, "doc_id": docID,
		})
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(payload)
}

type lockStateBatchBody struct {
	JobDocIDs   []string `json:"jobDocIDs"`
	GroupDocIDs []string `json:"groupDocIDs"`
}

func handleLockStateBatch(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	ctx := r.Context()
	accountID, ok := helper.RequireAccountID(w, r)
	if !ok {
		return
	}
	var b lockStateBatchBody
	if err := helper.DecodeJSONRequest(r, &b, helper.DefaultMaxBodySize); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	jobResults, groupResults, err := documentlock.StatusBatchResults(ctx, clients.Redis, accountID, b.JobDocIDs, b.GroupDocIDs)
	if err != nil {
		switch {
		case errors.Is(err, documentlock.ErrStatusBatchEmpty):
			http.Error(w, documentlock.ErrStatusBatchEmpty.Error(), http.StatusBadRequest)
		case errors.Is(err, documentlock.ErrStatusBatchTooMany):
			http.Error(w, fmt.Sprintf("maximum %d jobDocIDs and %d groupDocIDs per request", documentlock.MaxStatusBatchDocs, documentlock.MaxStatusBatchDocs), http.StatusBadRequest)
		case errors.Is(err, documentlock.ErrLocksUnavailable):
			http.Error(w, "Locks unavailable", http.StatusServiceUnavailable)
		default:
			helper.RespondEndpointServerError(w, r, "Internal error", "document lock state batch failed", "doc_lock_state_batch_failed", "document_lock_state_batch", err, map[string]interface{}{
				"account_id": accountID,
			})
		}
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"jobResults":   jobResults,
		"groupResults": groupResults,
	})
}

func handleClaimHandoff(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	hc, ok := lockHandlerContextOK(w, r, clients.Redis)
	if !ok {
		return
	}
	out, err := lockService(clients).ClaimHandoff(hc.Ctx, hc.AccountID, hc.SessionID, hc.Collection, hc.DocID)
	if err != nil {
		if errors.Is(err, documentlock.ErrLocksUnavailable) {
			http.Error(w, "Locks unavailable", http.StatusServiceUnavailable)
			return
		}
		helper.RespondEndpointServerError(w, r, "Internal error", "doc lock claim handoff failed", "doc_lock_claim_handoff_failed", "document_lock_claim_handoff", err, map[string]interface{}{
			"account_id": hc.AccountID, "collection": hc.Collection, "doc_id": hc.DocID,
		})
		return
	}
	if out.ErrText != "" {
		http.Error(w, out.ErrText, out.Status)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(out.Status)
	_ = json.NewEncoder(w).Encode(out.Payload)
}

func handleWaitlistPulse(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	hc, ok := lockHandlerContextOK(w, r, clients.Redis)
	if !ok {
		return
	}
	if err := lockService(clients).WaitlistPulse(hc.Ctx, hc.AccountID, hc.SessionID, hc.Collection, hc.DocID); err != nil {
		if errors.Is(err, documentlock.ErrLocksUnavailable) {
			http.Error(w, "Locks unavailable", http.StatusServiceUnavailable)
			return
		}
		helper.RespondEndpointServerError(w, r, "Internal error", "doc lock waitlist pulse failed", "doc_lock_waitlist_pulse_failed", "document_lock_waitlist_pulse", err, map[string]interface{}{
			"account_id": hc.AccountID, "collection": hc.Collection, "doc_id": hc.DocID,
		})
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
