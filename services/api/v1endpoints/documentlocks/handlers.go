package documentlocks

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"time"

	"eve-industry-planner/api/helper"
	"eve-industry-planner/api/helper/auth"
	"eve-industry-planner/api/helper/doclock"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/shared"
)

// Router serves /api/v1/document-locks/{action}
func Router(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	path := r.URL.Path
	switch {
	case path == "/api/v1/document-locks/acquire" || path == "/api/v1/document-locks/acquire/":
		if r.Method == http.MethodPost {
			handleAcquire(w, r, clients)
			return
		}
	case path == "/api/v1/document-locks/extend" || path == "/api/v1/document-locks/extend/":
		if r.Method == http.MethodPost {
			handleExtend(w, r, clients)
			return
		}
	case path == "/api/v1/document-locks/release" || path == "/api/v1/document-locks/release/":
		if r.Method == http.MethodPost {
			handleRelease(w, r, clients)
			return
		}
	case path == "/api/v1/document-locks/request" || path == "/api/v1/document-locks/request/":
		if r.Method == http.MethodPost {
			handleRequest(w, r, clients)
			return
		}
	case path == "/api/v1/document-locks/status-batch" || path == "/api/v1/document-locks/status-batch/":
		if r.Method == http.MethodPost {
			handleStatusBatch(w, r, clients)
			return
		}
	case path == "/api/v1/document-locks/status" || path == "/api/v1/document-locks/status/":
		if r.Method == http.MethodGet {
			handleStatus(w, r, clients)
			return
		}
	case path == "/api/v1/document-locks/claim-handoff" || path == "/api/v1/document-locks/claim-handoff/":
		if r.Method == http.MethodPost {
			handleClaimHandoff(w, r, clients)
			return
		}
	case path == "/api/v1/document-locks/waitlist-pulse" || path == "/api/v1/document-locks/waitlist-pulse/":
		if r.Method == http.MethodPost {
			handleWaitlistPulse(w, r, clients)
			return
		}
	}
	http.Error(w, "Not found", http.StatusNotFound)
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

func handleAcquire(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	ctx := r.Context()
	accountID, err := auth.ExtractAccountID(r)
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	sessionID, err := auth.ExtractSessionID(r)
	if err != nil {
		http.Error(w, "session_id claim required", http.StatusBadRequest)
		return
	}
	b, err := parseLockBody(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if clients.Redis == nil {
		http.Error(w, "Locks unavailable", http.StatusServiceUnavailable)
		return
	}

	existing, err := getLock(ctx, clients.Redis, accountID, b.Collection, b.DocID)
	if err != nil {
		logs.ErrorCtx(ctx, "doc lock get failed", "error", err)
		http.Error(w, "Internal error", http.StatusInternalServerError)
		return
	}
	now := time.Now().Unix()
	if existing != nil && existing.HolderSessionID != "" && existing.HolderSessionID != sessionID {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		payload := lockPayload(existing.ExpiresAtUnix)
		payload["held"] = true
		payload["acquired"] = false
		payload["holderSessionID"] = existing.HolderSessionID
		_ = json.NewEncoder(w).Encode(payload)
		return
	}

	exp := now + int64(DefaultLockTTL/time.Second)
	rec := lockRecord{
		HolderSessionID: sessionID,
		AccountID:       accountID,
		ExpiresAtUnix:   exp,
	}
	if err := setLock(ctx, clients.Redis, accountID, b.Collection, b.DocID, rec); err != nil {
		logs.ErrorCtx(ctx, "doc lock set failed", "error", err)
		http.Error(w, "Internal error", http.StatusInternalServerError)
		return
	}

	_ = publishLockEvent(ctx, clients, accountID, map[string]any{
		"type":          "document_lock_acquired",
		"collection":    b.Collection,
		"docID":         b.DocID,
		"sessionID":     sessionID,
		"expiresAtUnix": exp,
	})

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	acquiredPayload := lockPayload(exp)
	acquiredPayload["acquired"] = true
	acquiredPayload["held"] = true
	acquiredPayload["holderSessionID"] = sessionID
	_ = json.NewEncoder(w).Encode(acquiredPayload)
}

func handleExtend(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	ctx := r.Context()
	accountID, err := auth.ExtractAccountID(r)
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	sessionID, err := auth.ExtractSessionID(r)
	if err != nil {
		http.Error(w, "session_id claim required", http.StatusBadRequest)
		return
	}
	b, err := parseLockBody(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if clients.Redis == nil {
		http.Error(w, "Locks unavailable", http.StatusServiceUnavailable)
		return
	}
	existing, err := getLock(ctx, clients.Redis, accountID, b.Collection, b.DocID)
	if err != nil {
		http.Error(w, "Internal error", http.StatusInternalServerError)
		return
	}
	if existing == nil || existing.HolderSessionID != sessionID {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		if existing == nil {
			_ = json.NewEncoder(w).Encode(map[string]any{
				"holding": false,
				"held":    false,
			})
			return
		}
		payload := lockPayload(existing.ExpiresAtUnix)
		payload["holding"] = false
		payload["held"] = true
		payload["holderSessionID"] = existing.HolderSessionID
		_ = json.NewEncoder(w).Encode(payload)
		return
	}

	now := time.Now().Unix()
	exp := now + int64(DefaultLockTTL/time.Second)

	if existing.ProbeTargetSessionID != "" && now >= existing.ProbeExpiresAtUnix {
		_ = removeFromWaitlist(ctx, clients.Redis, accountID, b.Collection, b.DocID, existing.ProbeTargetSessionID)
		existing.ProbeTargetSessionID = ""
		existing.ProbeExpiresAtUnix = 0
	}

	if existing.ProbeTargetSessionID != "" && now < existing.ProbeExpiresAtUnix {
		existing.ExpiresAtUnix = exp
		if err := setLock(ctx, clients.Redis, accountID, b.Collection, b.DocID, *existing); err != nil {
			http.Error(w, "Internal error", http.StatusInternalServerError)
			return
		}
		writeExtendJSON(w, http.StatusOK, exp, existing.ExtendCount, extendExtras{
			handoffPending:       true,
			probeTargetSessionID: existing.ProbeTargetSessionID,
			probeExpiresAtUnix:   existing.ProbeExpiresAtUnix,
		})
		return
	}

	if existing.ExtendCount < MaxExtensionsBeforeHandoffConsult {
		existing.ExtendCount++
		existing.ExpiresAtUnix = exp
		if err := setLock(ctx, clients.Redis, accountID, b.Collection, b.DocID, *existing); err != nil {
			http.Error(w, "Internal error", http.StatusInternalServerError)
			return
		}
		writeExtendJSON(w, http.StatusOK, exp, existing.ExtendCount, extendExtras{handoffPending: false})
		return
	}

	existing.ExpiresAtUnix = exp
	head, err := peekWaitlistHeadAlive(ctx, clients.Redis, accountID, b.Collection, b.DocID)
	if err != nil {
		logs.ErrorCtx(ctx, "doc lock waitlist peek failed", "error", err)
		http.Error(w, "Internal error", http.StatusInternalServerError)
		return
	}
	if head == "" {
		existing.ExtendCount = 0
		if err := setLock(ctx, clients.Redis, accountID, b.Collection, b.DocID, *existing); err != nil {
			http.Error(w, "Internal error", http.StatusInternalServerError)
			return
		}
		writeExtendJSON(w, http.StatusOK, exp, 0, extendExtras{handoffPending: false, cycleReset: true})
		return
	}

	_ = touchWaitlistPulse(ctx, clients.Redis, accountID, b.Collection, b.DocID, head)

	existing.ProbeTargetSessionID = head
	existing.ProbeExpiresAtUnix = now + ProbeAckWaitSeconds
	if err := setLock(ctx, clients.Redis, accountID, b.Collection, b.DocID, *existing); err != nil {
		http.Error(w, "Internal error", http.StatusInternalServerError)
		return
	}
	_ = publishLockEvent(ctx, clients, accountID, map[string]any{
		"type":                 "document_lock_handoff_probe",
		"collection":           b.Collection,
		"docID":                b.DocID,
		"probeTargetSessionID": head,
		"holderSessionID":      sessionID,
		"probeExpiresAtUnix":   existing.ProbeExpiresAtUnix,
	})
	writeExtendJSON(w, http.StatusOK, exp, existing.ExtendCount, extendExtras{
		handoffPending:       true,
		probeTargetSessionID: head,
		probeExpiresAtUnix:   existing.ProbeExpiresAtUnix,
	})
}

func handleRelease(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	ctx := r.Context()
	accountID, err := auth.ExtractAccountID(r)
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	sessionID, err := auth.ExtractSessionID(r)
	if err != nil {
		http.Error(w, "session_id claim required", http.StatusBadRequest)
		return
	}
	b, err := parseLockBody(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if clients.Redis == nil {
		http.Error(w, "Locks unavailable", http.StatusServiceUnavailable)
		return
	}
	existing, err := getLock(ctx, clients.Redis, accountID, b.Collection, b.DocID)
	if err != nil {
		http.Error(w, "Internal error", http.StatusInternalServerError)
		return
	}
	if existing == nil || existing.HolderSessionID != sessionID {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	_ = deleteLock(ctx, clients.Redis, accountID, b.Collection, b.DocID)
	_ = publishLockEvent(ctx, clients, accountID, map[string]any{
		"type":       "document_lock_released",
		"collection": b.Collection,
		"docID":      b.DocID,
		"sessionID":  sessionID,
	})
	w.WriteHeader(http.StatusNoContent)
}

func handleRequest(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	ctx := r.Context()
	accountID, err := auth.ExtractAccountID(r)
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	requester, err := auth.ExtractSessionID(r)
	if err != nil {
		http.Error(w, "session_id claim required", http.StatusBadRequest)
		return
	}
	b, err := parseLockBody(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if clients.Redis == nil {
		http.Error(w, "Locks unavailable", http.StatusServiceUnavailable)
		return
	}

	existing, err := getLock(ctx, clients.Redis, accountID, b.Collection, b.DocID)
	if err != nil {
		logs.ErrorCtx(ctx, "doc lock get failed", "error", err)
		http.Error(w, "Internal error", http.StatusInternalServerError)
		return
	}

	now := time.Now().Unix()

	// No active lock → grant edit access immediately (same semantics as acquire).
	if existing == nil || existing.HolderSessionID == "" {
		exp := now + int64(DefaultLockTTL/time.Second)
		rec := lockRecord{
			HolderSessionID: requester,
			AccountID:       accountID,
			ExpiresAtUnix:   exp,
		}
		if err := setLock(ctx, clients.Redis, accountID, b.Collection, b.DocID, rec); err != nil {
			logs.ErrorCtx(ctx, "doc lock set failed (request auto-grant)", "error", err)
			http.Error(w, "Internal error", http.StatusInternalServerError)
			return
		}
		_ = publishLockEvent(ctx, clients, accountID, map[string]any{
			"type":                 "document_lock_acquired",
			"collection":           b.Collection,
			"docID":                b.DocID,
			"sessionID":            requester,
			"expiresAtUnix":        exp,
			"accessRequestGranted": true,
		})
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		acquiredPayload := lockPayload(exp)
		acquiredPayload["acquired"] = true
		acquiredPayload["held"] = true
		acquiredPayload["holderSessionID"] = requester
		acquiredPayload["accessRequestGranted"] = true
		_ = json.NewEncoder(w).Encode(acquiredPayload)
		return
	}

	if existing.HolderSessionID == requester {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		payload := lockPayload(existing.ExpiresAtUnix)
		payload["acquired"] = true
		payload["held"] = true
		payload["holderSessionID"] = requester
		payload["accessRequestGranted"] = true
		_ = json.NewEncoder(w).Encode(payload)
		return
	}

	if err := enqueueWaitlistUnique(ctx, clients.Redis, accountID, b.Collection, b.DocID, requester); err != nil {
		logs.ErrorCtx(ctx, "doc lock waitlist enqueue failed", "error", err)
		http.Error(w, "Internal error", http.StatusInternalServerError)
		return
	}
	_ = touchWaitlistPulse(ctx, clients.Redis, accountID, b.Collection, b.DocID, requester)

	_ = publishLockEvent(ctx, clients, accountID, map[string]any{
		"type":               "document_lock_requested",
		"collection":         b.Collection,
		"docID":              b.DocID,
		"requesterSessionID": requester,
	})
	w.WriteHeader(http.StatusAccepted)
}

func statusPayloadForDoc(ctx context.Context, clients *shared.ServiceClients, accountID, collection, docID string) (map[string]any, error) {
	rec, err := getLock(ctx, clients.Redis, accountID, collection, docID)
	if err != nil {
		return nil, err
	}
	if rec == nil {
		return map[string]any{"held": false}, nil
	}
	payload := lockPayload(rec.ExpiresAtUnix)
	payload["held"] = true
	payload["holderSessionID"] = rec.HolderSessionID
	payload["extendCount"] = rec.ExtendCount
	wl, err := waitlistLen(ctx, clients.Redis, accountID, collection, docID)
	if err != nil {
		logs.WarnCtx(ctx, "doc lock waitlist len failed", "error", err)
	} else {
		payload["waitlistLen"] = wl
	}
	if rec.ProbeTargetSessionID != "" {
		payload["probeTargetSessionID"] = rec.ProbeTargetSessionID
		payload["probeExpiresAtUnix"] = rec.ProbeExpiresAtUnix
	}
	return payload, nil
}

func handleStatus(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	ctx := r.Context()
	accountID, err := auth.ExtractAccountID(r)
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
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
	payload, err := statusPayloadForDoc(ctx, clients, accountID, collection, docID)
	if err != nil {
		http.Error(w, "Internal error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(payload)
}

// statusBatchBody batches job and/or group lock lookups in one HTTP request.
type statusBatchBody struct {
	JobDocIDs   []string `json:"jobDocIDs"`
	GroupDocIDs []string `json:"groupDocIDs"`
}

func handleStatusBatch(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	ctx := r.Context()
	accountID, err := auth.ExtractAccountID(r)
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	var b statusBatchBody
	if err := helper.DecodeJSONRequest(r, &b, helper.DefaultMaxBodySize); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	jobResults, groupResults, err := StatusBatchResults(ctx, clients, accountID, b.JobDocIDs, b.GroupDocIDs)
	if err != nil {
		switch {
		case errors.Is(err, ErrStatusBatchEmpty):
			http.Error(w, ErrStatusBatchEmpty.Error(), http.StatusBadRequest)
		case errors.Is(err, ErrStatusBatchTooMany):
			http.Error(w, fmt.Sprintf("maximum %d jobDocIDs and %d groupDocIDs per request", MaxStatusBatchDocs, MaxStatusBatchDocs), http.StatusBadRequest)
		case errors.Is(err, ErrLocksUnavailable):
			http.Error(w, "Locks unavailable", http.StatusServiceUnavailable)
		default:
			logs.ErrorCtx(ctx, "status batch failed", "error", err)
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
	ctx := r.Context()
	accountID, err := auth.ExtractAccountID(r)
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	requester, err := auth.ExtractSessionID(r)
	if err != nil {
		http.Error(w, "session_id claim required", http.StatusBadRequest)
		return
	}
	b, err := parseLockBody(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if clients.Redis == nil {
		http.Error(w, "Locks unavailable", http.StatusServiceUnavailable)
		return
	}

	rec, err := getLock(ctx, clients.Redis, accountID, b.Collection, b.DocID)
	if err != nil {
		http.Error(w, "Internal error", http.StatusInternalServerError)
		return
	}
	if rec == nil {
		http.Error(w, "Lock inactive", http.StatusConflict)
		return
	}

	now := time.Now().Unix()
	if rec.ProbeTargetSessionID != requester || now >= rec.ProbeExpiresAtUnix {
		http.Error(w, "No active probe for this session", http.StatusConflict)
		return
	}
	if rec.HolderSessionID == requester {
		http.Error(w, "Already editing", http.StatusBadRequest)
		return
	}

	_ = touchWaitlistPulse(ctx, clients.Redis, accountID, b.Collection, b.DocID, requester)

	head, err := peekWaitlistHead(ctx, clients.Redis, accountID, b.Collection, b.DocID)
	if err != nil || head != requester {
		http.Error(w, "No longer next in queue", http.StatusConflict)
		return
	}

	exp := now + int64(DefaultLockTTL/time.Second)
	oldHolder := rec.HolderSessionID
	rec.HolderSessionID = requester
	rec.ExpiresAtUnix = exp
	rec.ExtendCount = 0
	rec.ProbeTargetSessionID = ""
	rec.ProbeExpiresAtUnix = 0
	_ = removeFromWaitlist(ctx, clients.Redis, accountID, b.Collection, b.DocID, requester)
	if err := setLock(ctx, clients.Redis, accountID, b.Collection, b.DocID, *rec); err != nil {
		http.Error(w, "Internal error", http.StatusInternalServerError)
		return
	}

	_ = publishLockEvent(ctx, clients, accountID, map[string]any{
		"type":                    "document_lock_handoff_completed",
		"collection":              b.Collection,
		"docID":                   b.DocID,
		"sessionID":               requester,
		"previousHolderSessionID": oldHolder,
		"expiresAtUnix":           exp,
	})

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	acquiredPayload := lockPayload(exp)
	acquiredPayload["acquired"] = true
	acquiredPayload["held"] = true
	acquiredPayload["holderSessionID"] = requester
	acquiredPayload["handoffGranted"] = true
	_ = json.NewEncoder(w).Encode(acquiredPayload)
}

func handleWaitlistPulse(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	ctx := r.Context()
	accountID, err := auth.ExtractAccountID(r)
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	sessionID, err := auth.ExtractSessionID(r)
	if err != nil {
		http.Error(w, "session_id claim required", http.StatusBadRequest)
		return
	}
	b, err := parseLockBody(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if clients.Redis == nil {
		http.Error(w, "Locks unavailable", http.StatusServiceUnavailable)
		return
	}
	if err := touchWaitlistPulse(ctx, clients.Redis, accountID, b.Collection, b.DocID, sessionID); err != nil {
		logs.ErrorCtx(ctx, "doc lock waitlist pulse failed", "error", err)
		http.Error(w, "Internal error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func publishLockEvent(ctx context.Context, clients *shared.ServiceClients, accountID string, payload map[string]any) error {
	payload["accountID"] = accountID
	return doclock.PublishDocLockNotification(ctx, clients.JetStream, accountID, payload)
}
