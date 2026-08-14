package documentlocks

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"

	"eve-industry-planner/api/apideps"
	"eve-industry-planner/api/helper"
	"eve-industry-planner/shared/core/documentlock"
)

type Handlers struct {
	*apideps.Deps
}

func New(deps *apideps.Deps) *Handlers {
	if deps == nil {
		deps = &apideps.Deps{}
	}
	return &Handlers{Deps: deps}
}

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

func (h *Handlers) lockService() *documentlock.Service {
	return documentlock.NewService(h.LockDeps())
}

func (h *Handlers) handleAcquire(w http.ResponseWriter, r *http.Request) {
	hc, ok := lockHandlerContextOK(w, r, h.Redis)
	if !ok {
		return
	}
	out, err := h.lockService().Acquire(hc.Ctx, hc.AccountID, hc.SessionID, hc.Collection, hc.DocID)
	if err != nil {
		if errors.Is(err, documentlock.ErrLocksUnavailable) {
			respondLockUnavailable(w, r, "document_lock_acquire", hc, err)
			return
		}
		helper.RespondEndpointServerError(w, r, "Internal error", "doc lock acquire failed", "doc_lock_acquire_failed", "document_lock_acquire", err, lockTargetExtra(hc))
		return
	}
	finishLockAcquireSuccess(r, hc, out)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(out.StatusCode)
	_ = json.NewEncoder(w).Encode(out.Payload)
}

func (h *Handlers) handleExtend(w http.ResponseWriter, r *http.Request) {
	hc, ok := lockHandlerContextOK(w, r, h.Redis)
	if !ok {
		return
	}
	out, err := h.lockService().Extend(hc.Ctx, hc.AccountID, hc.SessionID, hc.Collection, hc.DocID)
	if err != nil {
		if errors.Is(err, documentlock.ErrLocksUnavailable) {
			respondLockUnavailable(w, r, "document_lock_extend", hc, err)
			return
		}
		helper.RespondEndpointServerError(w, r, "Internal error", "doc lock extend failed", "doc_lock_extend_failed", "document_lock_extend", err, lockTargetExtra(hc))
		return
	}
	if out.NotHolderPayload != nil {
		finishLockExtendSuccess(r, hc, out)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(out.StatusCode)
		_ = json.NewEncoder(w).Encode(out.NotHolderPayload)
		return
	}
	finishLockExtendSuccess(r, hc, out)
	writeExtendJSON(w, out.StatusCode, out.ExpiresAtUnix, out.ExtendCount, out.Extras)
}

func (h *Handlers) handleRelease(w http.ResponseWriter, r *http.Request) {
	hc, ok := lockHandlerContextOK(w, r, h.Redis)
	if !ok {
		return
	}
	err := h.lockService().Release(hc.Ctx, hc.AccountID, hc.SessionID, hc.Collection, hc.DocID)
	if err != nil {
		if errors.Is(err, documentlock.ErrLocksUnavailable) {
			respondLockUnavailable(w, r, "document_lock_release", hc, err)
			return
		}
		helper.RespondEndpointServerError(w, r, "Internal error", "doc lock release failed", "doc_lock_release_failed", "document_lock_release", err, lockTargetExtra(hc))
		return
	}
	finishLockHandlerSuccess(r, "release", http.StatusNoContent, hc, nil)
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handlers) handleForceRelease(w http.ResponseWriter, r *http.Request) {
	hc, ok := lockHandlerContextOK(w, r, h.Redis)
	if !ok {
		return
	}
	out, err := h.lockService().ForceReleaseSameAccount(hc.Ctx, hc.AccountID, hc.SessionID, hc.Collection, hc.DocID)
	if err != nil {
		switch {
		case errors.Is(err, documentlock.ErrLocksUnavailable):
			respondLockUnavailable(w, r, "document_lock_force_release", hc, err)
		case errors.Is(err, documentlock.ErrForceReleaseNoLock):
			attachLockHandlerClientFailure(r, "force-release", "document lock force-release: no active lock", "doc_lock_force_release_not_found", http.StatusNotFound, hc, nil)
			http.Error(w, "No active lock", http.StatusNotFound)
		case errors.Is(err, documentlock.ErrForceReleaseSameSession):
			attachLockHandlerClientFailure(r, "force-release", "document lock force-release: already holding lock", "doc_lock_force_release_same_session", http.StatusBadRequest, hc, nil)
			http.Error(w, "Already holding lock; use POST /release", http.StatusBadRequest)
		default:
			helper.RespondEndpointServerError(w, r, "Internal error", "doc lock force-release failed", "doc_lock_force_release_failed", "document_lock_force_release", err, lockTargetExtra(hc))
		}
		return
	}
	finishLockForceReleaseSuccess(r, hc, out)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(out.StatusCode)
	_ = json.NewEncoder(w).Encode(out.Payload)
}

func (h *Handlers) handleHandOver(w http.ResponseWriter, r *http.Request) {
	hc, ok := lockHandlerContextOK(w, r, h.Redis)
	if !ok {
		return
	}
	res, err := h.lockService().HandOver(hc.Ctx, hc.AccountID, hc.SessionID, hc.Collection, hc.DocID)
	if err != nil {
		if errors.Is(err, documentlock.ErrLocksUnavailable) {
			respondLockUnavailable(w, r, "document_lock_handover", hc, err)
			return
		}
		helper.RespondEndpointServerError(w, r, "Internal error", "doc lock hand over failed", "doc_lock_handover_failed", "document_lock_handover", err, lockTargetExtra(hc))
		return
	}
	switch res.StatusCode {
	case http.StatusConflict:
		attachLockHandlerClientFailure(r, "hand-over", "document lock hand-over: no queue change", "doc_lock_handover_noop", res.StatusCode, hc, map[string]any{
			"error_code": documentlock.ErrCodeHandOverNoop,
		})
	default:
		finishLockHandOverSuccess(r, hc, res)
	}
	if res.Payload != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(res.StatusCode)
		_ = json.NewEncoder(w).Encode(res.Payload)
		return
	}
	w.WriteHeader(res.StatusCode)
}

func (h *Handlers) handleRequest(w http.ResponseWriter, r *http.Request) {
	hc, ok := lockHandlerContextOK(w, r, h.Redis)
	if !ok {
		return
	}
	res, err := h.lockService().RequestAccess(hc.Ctx, hc.AccountID, hc.SessionID, hc.Collection, hc.DocID)
	if err != nil {
		if errors.Is(err, documentlock.ErrLocksUnavailable) {
			respondLockUnavailable(w, r, "document_lock_request", hc, err)
			return
		}
		helper.RespondEndpointServerError(w, r, "Internal error", "doc lock request access failed", "doc_lock_request_failed", "document_lock_request", err, lockTargetExtra(hc))
		return
	}
	finishLockRequestSuccess(r, hc, res)
	if res.Payload != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(res.StatusCode)
		_ = json.NewEncoder(w).Encode(res.Payload)
		return
	}
	w.WriteHeader(res.StatusCode)
}

func (h *Handlers) handleLockState(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	accountID, ok := helper.RequireAccountID(w, r)
	if !ok {
		return
	}
	collection := r.URL.Query().Get("collection")
	docID := r.URL.Query().Get("docID")
	if collection == "" || docID == "" {
		helper.RespondEndpointError(w, r, http.StatusBadRequest, "collection and docID query params required", "document lock state: missing query params", "doc_lock_state_bad_request", "document_lock_state", nil, map[string]any{
			"collection": collection,
			"doc_id":     docID,
		})
		return
	}
	if h.Redis == nil {
		helper.RespondEndpointError(w, r, http.StatusServiceUnavailable, "Locks unavailable", "document locks unavailable", documentlock.FailureUnavailable, "document_lock_state", nil, map[string]any{
			"collection": collection,
			"doc_id":     docID,
		})
		return
	}
	payload, err := documentlock.StatusPayloadForDoc(ctx, h.Redis, accountID, collection, docID)
	if err != nil {
		helper.RespondEndpointServerError(w, r, "Internal error", "document lock state failed", documentlock.FailureStateFailed, "document_lock_state", err, map[string]any{
			"account_id": accountID, "collection": collection, "doc_id": docID,
		})
		return
	}
	finishLockStateSuccess(r, "lock-state", accountID, collection, docID, nil)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(payload)
}

type lockStateBatchBody struct {
	JobDocIDs   []string `json:"jobDocIDs"`
	GroupDocIDs []string `json:"groupDocIDs"`
}

func (h *Handlers) handleLockStateBatch(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	accountID, ok := helper.RequireAccountID(w, r)
	if !ok {
		return
	}
	var b lockStateBatchBody
	if err := helper.DecodeJSONRequest(r, &b, helper.DefaultMaxBodySize); err != nil {
		helper.RespondEndpointError(w, r, http.StatusBadRequest, err.Error(), "document lock state batch: invalid request body", documentlock.FailureStateBatchBadRequest, "document_lock_state_batch", err, nil)
		return
	}
	jobResults, groupResults, err := documentlock.StatusBatchResults(ctx, h.Redis, accountID, b.JobDocIDs, b.GroupDocIDs)
	if err != nil {
		switch {
		case errors.Is(err, documentlock.ErrStatusBatchEmpty):
			helper.RespondEndpointError(w, r, http.StatusBadRequest, documentlock.ErrStatusBatchEmpty.Error(), "document lock state batch: empty request", documentlock.FailureStateBatchEmpty, "document_lock_state_batch", err, map[string]any{
				"account_id": accountID,
			})
		case errors.Is(err, documentlock.ErrStatusBatchTooMany):
			helper.RespondEndpointError(w, r, http.StatusBadRequest, fmt.Sprintf("maximum %d jobDocIDs and %d groupDocIDs per request", documentlock.MaxStatusBatchDocs, documentlock.MaxStatusBatchDocs), "document lock state batch: too many doc ids", documentlock.FailureStateBatchTooMany, "document_lock_state_batch", err, map[string]any{
				"account_id": accountID,
			})
		case errors.Is(err, documentlock.ErrLocksUnavailable):
			helper.RespondEndpointError(w, r, http.StatusServiceUnavailable, "Locks unavailable", "document locks unavailable", documentlock.FailureUnavailable, "document_lock_state_batch", err, map[string]any{
				"account_id": accountID,
			})
		default:
			helper.RespondEndpointServerError(w, r, "Internal error", "document lock state batch failed", documentlock.FailureStateBatchFailed, "document_lock_state_batch", err, map[string]any{
				"account_id": accountID,
			})
		}
		return
	}
	finishLockStateBatchSuccess(r, accountID, len(b.JobDocIDs), len(b.GroupDocIDs))
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"jobResults":   jobResults,
		"groupResults": groupResults,
	})
}

func (h *Handlers) handleClaimHandoff(w http.ResponseWriter, r *http.Request) {
	hc, ok := lockHandlerContextOK(w, r, h.Redis)
	if !ok {
		return
	}
	out, err := h.lockService().ClaimHandoff(hc.Ctx, hc.AccountID, hc.SessionID, hc.Collection, hc.DocID)
	if err != nil {
		if errors.Is(err, documentlock.ErrLocksUnavailable) {
			respondLockUnavailable(w, r, "document_lock_claim_handoff", hc, err)
			return
		}
		helper.RespondEndpointServerError(w, r, "Internal error", "doc lock claim handoff failed", "doc_lock_claim_handoff_failed", "document_lock_claim_handoff", err, lockTargetExtra(hc))
		return
	}
	if out.ErrText != "" {
		attachLockHandlerClientFailure(r, "claim-handoff", "document lock claim-handoff: "+out.ErrText, "doc_lock_claim_handoff_rejected", out.Status, hc, map[string]any{
			"reason": out.ErrText,
		})
		http.Error(w, out.ErrText, out.Status)
		return
	}
	finishLockClaimHandoffSuccess(r, hc, out)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(out.Status)
	_ = json.NewEncoder(w).Encode(out.Payload)
}

func (h *Handlers) handleWaitlistPulse(w http.ResponseWriter, r *http.Request) {
	hc, ok := lockHandlerContextOK(w, r, h.Redis)
	if !ok {
		return
	}
	if err := h.lockService().WaitlistPulse(hc.Ctx, hc.AccountID, hc.SessionID, hc.Collection, hc.DocID); err != nil {
		if errors.Is(err, documentlock.ErrLocksUnavailable) {
			respondLockUnavailable(w, r, "document_lock_waitlist_pulse", hc, err)
			return
		}
		helper.RespondEndpointServerError(w, r, "Internal error", "doc lock waitlist pulse failed", "doc_lock_waitlist_pulse_failed", "document_lock_waitlist_pulse", err, lockTargetExtra(hc))
		return
	}
	finishLockHandlerSuccess(r, "waitlist-pulse", http.StatusNoContent, hc, nil)
	w.WriteHeader(http.StatusNoContent)
}
