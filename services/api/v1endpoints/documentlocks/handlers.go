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
			http.Error(w, "Locks unavailable", http.StatusServiceUnavailable)
			return
		}
		logs.ErrorCtx(hc.Ctx, "doc lock acquire failed", "error", err)
		http.Error(w, "Internal error", http.StatusInternalServerError)
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
			http.Error(w, "Locks unavailable", http.StatusServiceUnavailable)
			return
		}
		http.Error(w, "Internal error", http.StatusInternalServerError)
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
			http.Error(w, "Locks unavailable", http.StatusServiceUnavailable)
			return
		}
		http.Error(w, "Internal error", http.StatusInternalServerError)
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
		logs.ErrorCtx(hc.Ctx, "doc lock force-release failed", "error", err)
		http.Error(w, "Internal error", http.StatusInternalServerError)
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
		logs.ErrorCtx(hc.Ctx, "doc lock hand over failed", "error", err)
		http.Error(w, "Internal error", http.StatusInternalServerError)
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
		logs.ErrorCtx(hc.Ctx, "doc lock request access failed", "error", err)
		http.Error(w, "Internal error", http.StatusInternalServerError)
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
		http.Error(w, "Internal error", http.StatusInternalServerError)
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
			logs.ErrorCtx(ctx, "document lock state batch failed", "error", err)
			http.Error(w, "Internal error", http.StatusInternalServerError)
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
		http.Error(w, "Internal error", http.StatusInternalServerError)
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
		logs.ErrorCtx(hc.Ctx, "doc lock waitlist pulse failed", "error", err)
		http.Error(w, "Internal error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
