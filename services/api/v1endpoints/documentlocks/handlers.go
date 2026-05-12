package documentlocks

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"time"

	"eve-industry-planner/api/helper"
	"eve-industry-planner/api/helper/doclock"
	mongocore "eve-industry-planner/shared/core/mongo"
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

func handleAcquire(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	hc, ok := lockHandlerContextOK(w, r, clients.Redis)
	if !ok {
		return
	}

	existing, err := getLock(hc.Ctx, hc.Redis, hc.AccountID, hc.Collection, hc.DocID)
	if err != nil {
		logs.ErrorCtx(hc.Ctx, "doc lock get failed", "error", err)
		http.Error(w, "Internal error", http.StatusInternalServerError)
		return
	}
	now := time.Now().Unix()
	if existing != nil && existing.HolderSessionID != "" && existing.HolderSessionID != hc.SessionID {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		payload := lockPayload(existing.ExpiresAtUnix)
		payload["held"] = true
		payload["acquired"] = false
		payload["holderSessionID"] = existing.HolderSessionID
		// Seed the viewer count so the requester (now a passive viewer) doesn't
		// have to wait for the 45 s status sync to learn how many other tabs are
		// already on this doc — irrelevant to them, but consistent with /status.
		if vc, err := pruneAndCountViewers(hc.Ctx, hc.Redis, hc.AccountID, hc.Collection, hc.DocID); err == nil {
			payload["viewerCount"] = vc
		}
		_ = json.NewEncoder(w).Encode(payload)
		return
	}

	exp := now + int64(DefaultLockTTL/time.Second)
	rec := lockRecord{
		HolderSessionID: hc.SessionID,
		AccountID:       hc.AccountID,
		ExpiresAtUnix:   exp,
	}
	if err := setLock(hc.Ctx, hc.Redis, hc.AccountID, hc.Collection, hc.DocID, rec); err != nil {
		logs.ErrorCtx(hc.Ctx, "doc lock set failed", "error", err)
		http.Error(w, "Internal error", http.StatusInternalServerError)
		return
	}

	_ = publishLockEvent(hc.Ctx, clients, hc.AccountID, map[string]any{
		"type":          LockEventAcquired,
		"collection":    hc.Collection,
		"docID":         hc.DocID,
		"sessionID":     hc.SessionID,
		"expiresAtUnix": exp,
	})

	// Mounting a tab onto a group page right after the previous holder's lease
	// expired lands here (existing was nil → granted to us). The previous holder's
	// per-job locks may still be alive; cascade them so the cards align with the
	// new group holder. No-op when there are no stale per-job locks.
	if hc.Collection == mongocore.CollectionUserJobGroups {
		ReleaseStaleDependentJobLocksAfterGroupGrant(
			hc.Ctx, clients, hc.AccountID, hc.DocID, hc.SessionID,
		)
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	acquiredPayload := lockPayload(exp)
	acquiredPayload["acquired"] = true
	acquiredPayload["held"] = true
	acquiredPayload["holderSessionID"] = hc.SessionID
	_ = json.NewEncoder(w).Encode(acquiredPayload)
}

func handleExtend(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	hc, ok := lockHandlerContextOK(w, r, clients.Redis)
	if !ok {
		return
	}
	existing, err := getLock(hc.Ctx, hc.Redis, hc.AccountID, hc.Collection, hc.DocID)
	if err != nil {
		http.Error(w, "Internal error", http.StatusInternalServerError)
		return
	}
	if existing == nil || existing.HolderSessionID != hc.SessionID {
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
		_ = removeFromWaitlist(hc.Ctx, hc.Redis, hc.AccountID, hc.Collection, hc.DocID, existing.ProbeTargetSessionID)
		existing.ProbeTargetSessionID = ""
		existing.ProbeExpiresAtUnix = 0
	}

	if existing.ProbeTargetSessionID != "" && now < existing.ProbeExpiresAtUnix {
		existing.ExpiresAtUnix = exp
		if err := setLock(hc.Ctx, hc.Redis, hc.AccountID, hc.Collection, hc.DocID, *existing); err != nil {
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
		if err := setLock(hc.Ctx, hc.Redis, hc.AccountID, hc.Collection, hc.DocID, *existing); err != nil {
			http.Error(w, "Internal error", http.StatusInternalServerError)
			return
		}
		writeExtendJSON(w, http.StatusOK, exp, existing.ExtendCount, extendExtras{handoffPending: false})
		return
	}

	existing.ExpiresAtUnix = exp
	head, err := peekWaitlistHeadAlive(hc.Ctx, hc.Redis, hc.AccountID, hc.Collection, hc.DocID)
	if err != nil {
		logs.ErrorCtx(hc.Ctx, "doc lock waitlist peek failed", "error", err)
		http.Error(w, "Internal error", http.StatusInternalServerError)
		return
	}
	if head == "" {
		existing.ExtendCount = 0
		if err := setLock(hc.Ctx, hc.Redis, hc.AccountID, hc.Collection, hc.DocID, *existing); err != nil {
			http.Error(w, "Internal error", http.StatusInternalServerError)
			return
		}
		writeExtendJSON(w, http.StatusOK, exp, 0, extendExtras{handoffPending: false, cycleReset: true})
		return
	}

	_ = touchWaitlistPulse(hc.Ctx, hc.Redis, hc.AccountID, hc.Collection, hc.DocID, head)

	existing.ProbeTargetSessionID = head
	existing.ProbeExpiresAtUnix = now + ProbeAckWaitSeconds
	if err := setLock(hc.Ctx, hc.Redis, hc.AccountID, hc.Collection, hc.DocID, *existing); err != nil {
		http.Error(w, "Internal error", http.StatusInternalServerError)
		return
	}
	_ = publishLockEvent(hc.Ctx, clients, hc.AccountID, map[string]any{
		"type":                 LockEventHandoffProbe,
		"collection":           hc.Collection,
		"docID":                hc.DocID,
		"probeTargetSessionID": head,
		"holderSessionID":      hc.SessionID,
		"probeExpiresAtUnix":   existing.ProbeExpiresAtUnix,
	})
	writeExtendJSON(w, http.StatusOK, exp, existing.ExtendCount, extendExtras{
		handoffPending:       true,
		probeTargetSessionID: head,
		probeExpiresAtUnix:   existing.ProbeExpiresAtUnix,
	})
}

func handleRelease(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	hc, ok := lockHandlerContextOK(w, r, clients.Redis)
	if !ok {
		return
	}
	existing, err := getLock(hc.Ctx, hc.Redis, hc.AccountID, hc.Collection, hc.DocID)
	if err != nil {
		http.Error(w, "Internal error", http.StatusInternalServerError)
		return
	}
	if existing == nil || existing.HolderSessionID != hc.SessionID {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	_ = deleteLock(hc.Ctx, hc.Redis, hc.AccountID, hc.Collection, hc.DocID)
	_ = publishLockEvent(hc.Ctx, clients, hc.AccountID, map[string]any{
		"type":       LockEventReleased,
		"collection": hc.Collection,
		"docID":      hc.DocID,
		"sessionID":  hc.SessionID,
	})
	w.WriteHeader(http.StatusNoContent)
}

// handleHandOver is the server side of the holder's "accept" action on the
// access-request snackbar. Instead of dropping the lock to neutral (which
// `handleRelease` does) we atomically transfer ownership to the alive waitlist
// head — this is the same state transition `handleClaimHandoff` performs after
// a probe ack, except triggered by the holder instead of the queued session.
//
// Falls back to a plain release when the waitlist has no live pulse (the
// requester already left); in that path the cascade and grant are skipped and
// the lock becomes orphaned, matching the previous behaviour for that edge.
func handleHandOver(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	hc, ok := lockHandlerContextOK(w, r, clients.Redis)
	if !ok {
		return
	}
	holder := hc.SessionID

	existing, err := getLock(hc.Ctx, hc.Redis, hc.AccountID, hc.Collection, hc.DocID)
	if err != nil {
		logs.ErrorCtx(hc.Ctx, "doc lock get failed", "error", err)
		http.Error(w, "Internal error", http.StatusInternalServerError)
		return
	}
	if existing == nil || existing.HolderSessionID != holder {
		// Lock vanished or someone else owns it (server-side handoff already
		// ran, or our session lost the lock to a TTL race). Nothing to hand
		// over — keep the response uniform with /release so the client's
		// optimistic state still settles.
		w.WriteHeader(http.StatusNoContent)
		return
	}

	newHolder, rec, promoted, err := promoteWaitlistHead(hc.Ctx, hc.Redis, hc.AccountID, hc.Collection, hc.DocID)
	if err != nil {
		logs.ErrorCtx(hc.Ctx, "doc lock waitlist peek failed", "error", err)
		http.Error(w, "Internal error", http.StatusInternalServerError)
		return
	}

	if !promoted {
		// The requester is no longer alive (closed tab between request and
		// accept). Match the existing /release semantics: drop the lock so
		// anyone can take it, no `handoff_completed`.
		_ = deleteLock(hc.Ctx, hc.Redis, hc.AccountID, hc.Collection, hc.DocID)
		_ = publishLockEvent(hc.Ctx, clients, hc.AccountID, map[string]any{
			"type":       LockEventReleased,
			"collection": hc.Collection,
			"docID":      hc.DocID,
			"sessionID":  holder,
			"reason":     LockReleaseReasonHandOverNoQueue,
		})
		w.WriteHeader(http.StatusNoContent)
		return
	}

	oldHolder := holder

	_ = publishLockEvent(hc.Ctx, clients, hc.AccountID, buildHandoffCompletedPayload(
		hc.Collection,
		hc.DocID,
		newHolder,
		rec.ExpiresAtUnix,
		HandoffCompletedOpts{
			PreviousHolderSessionID: oldHolder,
			Reason:                  LockHandoffReasonHolderHandover,
		},
	))

	// Group handoffs orphan the old holder's per-job locks — mirror
	// handleClaimHandoff's cascade so the new owner's cards align immediately.
	if hc.Collection == mongocore.CollectionUserJobGroups {
		releaseDependentJobLocksOnGroupHandoff(hc.Ctx, clients, hc.AccountID, hc.DocID, oldHolder)
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	payload := lockPayload(rec.ExpiresAtUnix)
	payload["held"] = true
	payload["holderSessionID"] = newHolder
	payload["handoffGranted"] = true
	_ = json.NewEncoder(w).Encode(payload)
}

func handleRequest(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	hc, ok := lockHandlerContextOK(w, r, clients.Redis)
	if !ok {
		return
	}
	requester := hc.SessionID

	existing, err := getLock(hc.Ctx, hc.Redis, hc.AccountID, hc.Collection, hc.DocID)
	if err != nil {
		logs.ErrorCtx(hc.Ctx, "doc lock get failed", "error", err)
		http.Error(w, "Internal error", http.StatusInternalServerError)
		return
	}

	now := time.Now().Unix()

	// No active lock → grant edit access immediately (same semantics as acquire).
	if existing == nil || existing.HolderSessionID == "" {
		exp := now + int64(DefaultLockTTL/time.Second)
		rec := lockRecord{
			HolderSessionID: requester,
			AccountID:       hc.AccountID,
			ExpiresAtUnix:   exp,
		}
		if err := setLock(hc.Ctx, hc.Redis, hc.AccountID, hc.Collection, hc.DocID, rec); err != nil {
			logs.ErrorCtx(hc.Ctx, "doc lock set failed (request auto-grant)", "error", err)
			http.Error(w, "Internal error", http.StatusInternalServerError)
			return
		}
		_ = publishLockEvent(hc.Ctx, clients, hc.AccountID, map[string]any{
			"type":                 LockEventAcquired,
			"collection":           hc.Collection,
			"docID":                hc.DocID,
			"sessionID":            requester,
			"expiresAtUnix":        exp,
			"accessRequestGranted": true,
		})

		// "Take over" an orphaned group from the header popover lands here: the
		// previous holder's per-job locks may still be lingering until their own
		// TTL fires. Clear them so the new holder's cards reflect the take-over
		// immediately, the same way `handleClaimHandoff` does for manual handoff.
		if hc.Collection == mongocore.CollectionUserJobGroups {
			ReleaseStaleDependentJobLocksAfterGroupGrant(
				hc.Ctx, clients, hc.AccountID, hc.DocID, requester,
			)
		}

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

	if err := enqueueWaitlistUnique(hc.Ctx, hc.Redis, hc.AccountID, hc.Collection, hc.DocID, requester); err != nil {
		logs.ErrorCtx(hc.Ctx, "doc lock waitlist enqueue failed", "error", err)
		http.Error(w, "Internal error", http.StatusInternalServerError)
		return
	}
	_ = touchWaitlistPulse(hc.Ctx, hc.Redis, hc.AccountID, hc.Collection, hc.DocID, requester)

	_ = publishLockEvent(hc.Ctx, clients, hc.AccountID, map[string]any{
		"type":               LockEventRequested,
		"collection":         hc.Collection,
		"docID":              hc.DocID,
		"requesterSessionID": requester,
	})
	w.WriteHeader(http.StatusAccepted)
}

func statusPayloadForDoc(ctx context.Context, clients *shared.ServiceClients, accountID, collection, docID string) (map[string]any, error) {
	rec, err := getLock(ctx, clients.Redis, accountID, collection, docID)
	if err != nil {
		return nil, err
	}
	// Prune+count viewers on every read so the returned payload is always fresh.
	// Calling this for both held and unheld locks keeps the API surface uniform —
	// a non-held doc with stranded viewers (rare race) still self-cleans.
	viewerCount, vcErr := pruneAndCountViewers(ctx, clients.Redis, accountID, collection, docID)
	if vcErr != nil {
		logs.WarnCtx(ctx, "doc lock viewer count failed", "error", vcErr)
	}
	if rec == nil {
		payload := map[string]any{"held": false}
		if vcErr == nil {
			payload["viewerCount"] = viewerCount
		}
		return payload, nil
	}
	payload := lockPayload(rec.ExpiresAtUnix)
	payload["held"] = true
	payload["holderSessionID"] = rec.HolderSessionID
	payload["extendCount"] = rec.ExtendCount
	if vcErr == nil {
		payload["viewerCount"] = viewerCount
	}
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
	accountID, ok := helper.RequireAccountID(w, r)
	if !ok {
		return
	}
	var err error
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
	hc, ok := lockHandlerContextOK(w, r, clients.Redis)
	if !ok {
		return
	}
	requester := hc.SessionID

	rec, err := getLock(hc.Ctx, hc.Redis, hc.AccountID, hc.Collection, hc.DocID)
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

	_ = touchWaitlistPulse(hc.Ctx, hc.Redis, hc.AccountID, hc.Collection, hc.DocID, requester)

	head, err := peekWaitlistHead(hc.Ctx, hc.Redis, hc.AccountID, hc.Collection, hc.DocID)
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
	_ = removeFromWaitlist(hc.Ctx, hc.Redis, hc.AccountID, hc.Collection, hc.DocID, requester)
	if err := setLock(hc.Ctx, hc.Redis, hc.AccountID, hc.Collection, hc.DocID, *rec); err != nil {
		http.Error(w, "Internal error", http.StatusInternalServerError)
		return
	}

	_ = publishLockEvent(hc.Ctx, clients, hc.AccountID, buildHandoffCompletedPayload(
		hc.Collection,
		hc.DocID,
		requester,
		exp,
		HandoffCompletedOpts{PreviousHolderSessionID: oldHolder},
	))

	// A group handoff leaves the old holder's per-job locks orphaned; clear them
	// before responding so the new holder's status batch reads a consistent state.
	if hc.Collection == mongocore.CollectionUserJobGroups {
		releaseDependentJobLocksOnGroupHandoff(hc.Ctx, clients, hc.AccountID, hc.DocID, oldHolder)
	}

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
	hc, ok := lockHandlerContextOK(w, r, clients.Redis)
	if !ok {
		return
	}
	if err := touchWaitlistPulse(hc.Ctx, hc.Redis, hc.AccountID, hc.Collection, hc.DocID, hc.SessionID); err != nil {
		logs.ErrorCtx(hc.Ctx, "doc lock waitlist pulse failed", "error", err)
		http.Error(w, "Internal error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func publishLockEvent(ctx context.Context, clients *shared.ServiceClients, accountID string, payload map[string]any) error {
	payload["accountID"] = accountID
	return doclock.PublishDocLockNotification(ctx, clients.JetStream, accountID, payload)
}
