package documentlock

import (
	"context"
	"net/http"
	"time"

	mongocore "eve-industry-planner/shared/core/mongo"
)

// AcquireResult is the outcome of attempting to acquire the edit lock.
type AcquireResult struct {
	StatusCode int
	Payload    map[string]any
}

// Acquire grants the lock when uncontested or returns contended payload when another session holds it.
func (s *Service) Acquire(ctx context.Context, accountID, sessionID, collection, docID string) (*AcquireResult, error) {
	rdb := s.Deps.Redis
	if rdb == nil {
		return nil, ErrLocksUnavailable
	}
	existing, err := GetLock(ctx, rdb, accountID, collection, docID)
	if err != nil {
		return nil, err
	}
	now := time.Now().Unix()
	if existing != nil && existing.HolderSessionID != "" && existing.HolderSessionID != sessionID {
		payload := LockPayload(existing.ExpiresAtUnix)
		payload["held"] = true
		payload["acquired"] = false
		payload["holderSessionID"] = existing.HolderSessionID
		if vc, err := PruneAndCountViewers(ctx, rdb, accountID, collection, docID); err == nil {
			payload["viewerCount"] = vc
		}
		return &AcquireResult{StatusCode: http.StatusOK, Payload: payload}, nil
	}

	exp := now + int64(DefaultLockTTL/time.Second)
	rec := LockRecord{
		HolderSessionID: sessionID,
		AccountID:       accountID,
		ExpiresAtUnix:   exp,
	}
	if err := SetLock(ctx, rdb, accountID, collection, docID, rec); err != nil {
		return nil, err
	}

	_ = PublishLockEvent(ctx, s.Deps.JetStream, accountID, map[string]any{
		LockPayloadEventKey: LockEventAcquired,
		"collection":         collection,
		"docID":         docID,
		"sessionID":     sessionID,
		"expiresAtUnix": exp,
	})

	if collection == mongocore.CollectionUserJobGroups {
		ReleaseStaleDependentJobLocksAfterGroupGrant(ctx, s.Deps, accountID, docID, sessionID)
	}

	acquiredPayload := LockPayload(exp)
	acquiredPayload["acquired"] = true
	acquiredPayload["held"] = true
	acquiredPayload["holderSessionID"] = sessionID
	return &AcquireResult{StatusCode: http.StatusCreated, Payload: acquiredPayload}, nil
}

// ExtendResult is returned by Extend for the holder renew / handoff-probe paths.
type ExtendResult struct {
	StatusCode    int
	ExpiresAtUnix int64
	ExtendCount   int
	Extras        ExtendExtras
	// NotHolderPayload is set when the caller is not the holder (still JSON 200).
	NotHolderPayload map[string]any
}

// Extend renews the lease for the current holder or returns not-holder JSON.
func (s *Service) Extend(ctx context.Context, accountID, sessionID, collection, docID string) (*ExtendResult, error) {
	rdb := s.Deps.Redis
	if rdb == nil {
		return nil, ErrLocksUnavailable
	}
	existing, err := GetLock(ctx, rdb, accountID, collection, docID)
	if err != nil {
		return nil, err
	}
	if existing == nil || existing.HolderSessionID != sessionID {
		if existing == nil {
			return &ExtendResult{
				StatusCode: http.StatusOK,
				NotHolderPayload: map[string]any{
					"holding": false,
					"held":    false,
				},
			}, nil
		}
		payload := LockPayload(existing.ExpiresAtUnix)
		payload["holding"] = false
		payload["held"] = true
		payload["holderSessionID"] = existing.HolderSessionID
		return &ExtendResult{StatusCode: http.StatusOK, NotHolderPayload: payload}, nil
	}

	now := time.Now().Unix()
	exp := now + int64(DefaultLockTTL/time.Second)

	if existing.ProbeTargetSessionID != "" && now >= existing.ProbeExpiresAtUnix {
		_ = RemoveFromWaitlist(ctx, rdb, accountID, collection, docID, existing.ProbeTargetSessionID)
		existing.ProbeTargetSessionID = ""
		existing.ProbeExpiresAtUnix = 0
	}

	if existing.ProbeTargetSessionID != "" && now < existing.ProbeExpiresAtUnix {
		existing.ExpiresAtUnix = exp
		if err := SetLock(ctx, rdb, accountID, collection, docID, *existing); err != nil {
			return nil, err
		}
		return &ExtendResult{
			StatusCode:    http.StatusOK,
			ExpiresAtUnix: exp,
			ExtendCount:   existing.ExtendCount,
			Extras: ExtendExtras{
				HandoffPending:       true,
				ProbeTargetSessionID: existing.ProbeTargetSessionID,
				ProbeExpiresAtUnix:   existing.ProbeExpiresAtUnix,
			},
		}, nil
	}

	if existing.ExtendCount < MaxExtensionsBeforeHandoffConsult {
		existing.ExtendCount++
		existing.ExpiresAtUnix = exp
		if err := SetLock(ctx, rdb, accountID, collection, docID, *existing); err != nil {
			return nil, err
		}
		return &ExtendResult{
			StatusCode:    http.StatusOK,
			ExpiresAtUnix: exp,
			ExtendCount:   existing.ExtendCount,
			Extras:        ExtendExtras{HandoffPending: false},
		}, nil
	}

	existing.ExpiresAtUnix = exp
	head, err := PeekWaitlistHeadAlive(ctx, rdb, accountID, collection, docID)
	if err != nil {
		return nil, err
	}
	if head == "" {
		existing.ExtendCount = 0
		if err := SetLock(ctx, rdb, accountID, collection, docID, *existing); err != nil {
			return nil, err
		}
		return &ExtendResult{
			StatusCode:    http.StatusOK,
			ExpiresAtUnix: exp,
			ExtendCount:   0,
			Extras:        ExtendExtras{HandoffPending: false, CycleReset: true},
		}, nil
	}

	_ = TouchWaitlistPulse(ctx, rdb, accountID, collection, docID, head)

	existing.ProbeTargetSessionID = head
	existing.ProbeExpiresAtUnix = now + ProbeAckWaitSeconds
	if err := SetLock(ctx, rdb, accountID, collection, docID, *existing); err != nil {
		return nil, err
	}
	_ = PublishLockEvent(ctx, s.Deps.JetStream, accountID, map[string]any{
		LockPayloadEventKey:    LockEventHandoffProbe,
		"collection":           collection,
		"docID":                docID,
		"probeTargetSessionID": head,
		"holderSessionID":      sessionID,
		"probeExpiresAtUnix":   existing.ProbeExpiresAtUnix,
	})
	return &ExtendResult{
		StatusCode:    http.StatusOK,
		ExpiresAtUnix: exp,
		ExtendCount:   existing.ExtendCount,
		Extras: ExtendExtras{
			HandoffPending:       true,
			ProbeTargetSessionID: head,
			ProbeExpiresAtUnix:   existing.ProbeExpiresAtUnix,
		},
	}, nil
}

// Release drops the lock when the caller is the holder (no-op 204 otherwise).
func (s *Service) Release(ctx context.Context, accountID, sessionID, collection, docID string) error {
	rdb := s.Deps.Redis
	if rdb == nil {
		return ErrLocksUnavailable
	}
	existing, err := GetLock(ctx, rdb, accountID, collection, docID)
	if err != nil {
		return err
	}
	if existing == nil || existing.HolderSessionID != sessionID {
		return nil
	}
	_ = DeleteLock(ctx, rdb, accountID, collection, docID)
	_ = PublishLockEvent(ctx, s.Deps.JetStream, accountID, map[string]any{
		LockPayloadEventKey: LockEventReleased,
		"collection":       collection,
		"docID":      docID,
		"sessionID":  sessionID,
	})
	return nil
}

// HandOverResult is the outcome of the holder accepting the waitlist head.
type HandOverResult struct {
	StatusCode int
	Payload    map[string]any // nil for 204 responses
}

// HandOver transfers the lock to the alive waitlist head or releases when none.
func (s *Service) HandOver(ctx context.Context, accountID, holderSessionID, collection, docID string) (*HandOverResult, error) {
	rdb := s.Deps.Redis
	if rdb == nil {
		return nil, ErrLocksUnavailable
	}
	existing, err := GetLock(ctx, rdb, accountID, collection, docID)
	if err != nil {
		return nil, err
	}
	if existing == nil || existing.HolderSessionID != holderSessionID {
		return &HandOverResult{StatusCode: http.StatusNoContent}, nil
	}

	newHolder, rec, promoted, err := PromoteWaitlistHead(ctx, rdb, accountID, collection, docID)
	if err != nil {
		return nil, err
	}

	if !promoted {
		_ = DeleteLock(ctx, rdb, accountID, collection, docID)
		_ = PublishLockEvent(ctx, s.Deps.JetStream, accountID, map[string]any{
			LockPayloadEventKey: LockEventReleased,
			"collection":         collection,
			"docID":      docID,
			"sessionID":  holderSessionID,
			"reason":     LockReleaseReasonHandOverNoQueue,
		})
		return &HandOverResult{StatusCode: http.StatusNoContent}, nil
	}

	oldHolder := holderSessionID

	_ = PublishLockEvent(ctx, s.Deps.JetStream, accountID, BuildHandoffCompletedPayload(
		collection,
		docID,
		newHolder,
		rec.ExpiresAtUnix,
		HandoffCompletedOpts{
			PreviousHolderSessionID: oldHolder,
			Reason:                  LockHandoffReasonHolderHandover,
		},
	))

	if collection == mongocore.CollectionUserJobGroups {
		ReleaseDependentJobLocksOnGroupHandoff(ctx, s.Deps, accountID, docID, oldHolder)
	}

	payload := LockPayload(rec.ExpiresAtUnix)
	payload["held"] = true
	payload["holderSessionID"] = newHolder
	payload["handoffGranted"] = true
	return &HandOverResult{StatusCode: http.StatusOK, Payload: payload}, nil
}

// RequestLockResult is the outcome of POST /request (queue, auto-grant, or same-holder refresh).
type RequestLockResult struct {
	StatusCode int
	Payload    map[string]any
}

// RequestAccess queues for the lock, auto-grants when empty, or returns same-holder payload.
func (s *Service) RequestAccess(ctx context.Context, accountID, requesterSessionID, collection, docID string) (*RequestLockResult, error) {
	rdb := s.Deps.Redis
	if rdb == nil {
		return nil, ErrLocksUnavailable
	}
	existing, err := GetLock(ctx, rdb, accountID, collection, docID)
	if err != nil {
		return nil, err
	}

	now := time.Now().Unix()

	if existing == nil || existing.HolderSessionID == "" {
		exp := now + int64(DefaultLockTTL/time.Second)
		rec := LockRecord{
			HolderSessionID: requesterSessionID,
			AccountID:       accountID,
			ExpiresAtUnix:   exp,
		}
		if err := SetLock(ctx, rdb, accountID, collection, docID, rec); err != nil {
			return nil, err
		}
		_ = PublishLockEvent(ctx, s.Deps.JetStream, accountID, map[string]any{
			LockPayloadEventKey: LockEventAcquired,
			"collection":           collection,
			"docID":                docID,
			"sessionID":            requesterSessionID,
			"expiresAtUnix":        exp,
			"accessRequestGranted": true,
		})

		if collection == mongocore.CollectionUserJobGroups {
			ReleaseStaleDependentJobLocksAfterGroupGrant(ctx, s.Deps, accountID, docID, requesterSessionID)
		}

		acquiredPayload := LockPayload(exp)
		acquiredPayload["acquired"] = true
		acquiredPayload["held"] = true
		acquiredPayload["holderSessionID"] = requesterSessionID
		acquiredPayload["accessRequestGranted"] = true
		return &RequestLockResult{StatusCode: http.StatusCreated, Payload: acquiredPayload}, nil
	}

	if existing.HolderSessionID == requesterSessionID {
		payload := LockPayload(existing.ExpiresAtUnix)
		payload["acquired"] = true
		payload["held"] = true
		payload["holderSessionID"] = requesterSessionID
		payload["accessRequestGranted"] = true
		return &RequestLockResult{StatusCode: http.StatusOK, Payload: payload}, nil
	}

	if err := EnqueueWaitlistUnique(ctx, rdb, accountID, collection, docID, requesterSessionID); err != nil {
		return nil, err
	}
	_ = TouchWaitlistPulse(ctx, rdb, accountID, collection, docID, requesterSessionID)

	_ = PublishLockEvent(ctx, s.Deps.JetStream, accountID, map[string]any{
		LockPayloadEventKey: LockEventRequested,
		"collection":         collection,
		"docID":              docID,
		"requesterSessionID": requesterSessionID,
	})
	return &RequestLockResult{StatusCode: http.StatusAccepted, Payload: nil}, nil
}

// ClaimHandoffOutput is the outcome of POST /claim-handoff.
type ClaimHandoffOutput struct {
	Status  int
	Payload map[string]any // set only for 200
	ErrText string         // plain HTTP error body for non-200 (4xx)
}

// ClaimHandoff completes a probe-driven handoff for the queued session.
func (s *Service) ClaimHandoff(ctx context.Context, accountID, requesterSessionID, collection, docID string) (*ClaimHandoffOutput, error) {
	rdb := s.Deps.Redis
	if rdb == nil {
		return nil, ErrLocksUnavailable
	}
	rec, err := GetLock(ctx, rdb, accountID, collection, docID)
	if err != nil {
		return nil, err
	}
	if rec == nil {
		return &ClaimHandoffOutput{Status: http.StatusConflict, ErrText: "Lock inactive"}, nil
	}

	now := time.Now().Unix()
	if rec.ProbeTargetSessionID != requesterSessionID || now >= rec.ProbeExpiresAtUnix {
		return &ClaimHandoffOutput{Status: http.StatusConflict, ErrText: "No active probe for this session"}, nil
	}
	if rec.HolderSessionID == requesterSessionID {
		return &ClaimHandoffOutput{Status: http.StatusBadRequest, ErrText: "Already editing"}, nil
	}

	_ = TouchWaitlistPulse(ctx, rdb, accountID, collection, docID, requesterSessionID)

	head, err := PeekWaitlistHead(ctx, rdb, accountID, collection, docID)
	if err != nil || head != requesterSessionID {
		return &ClaimHandoffOutput{Status: http.StatusConflict, ErrText: "No longer next in queue"}, nil
	}

	exp := now + int64(DefaultLockTTL/time.Second)
	oldHolder := rec.HolderSessionID
	rec.HolderSessionID = requesterSessionID
	rec.ExpiresAtUnix = exp
	rec.ExtendCount = 0
	rec.ProbeTargetSessionID = ""
	rec.ProbeExpiresAtUnix = 0
	_ = RemoveFromWaitlist(ctx, rdb, accountID, collection, docID, requesterSessionID)
	if err := SetLock(ctx, rdb, accountID, collection, docID, *rec); err != nil {
		return nil, err
	}

	_ = PublishLockEvent(ctx, s.Deps.JetStream, accountID, BuildHandoffCompletedPayload(
		collection,
		docID,
		requesterSessionID,
		exp,
		HandoffCompletedOpts{PreviousHolderSessionID: oldHolder},
	))

	if collection == mongocore.CollectionUserJobGroups {
		ReleaseDependentJobLocksOnGroupHandoff(ctx, s.Deps, accountID, docID, oldHolder)
	}

	acquiredPayload := LockPayload(exp)
	acquiredPayload["acquired"] = true
	acquiredPayload["held"] = true
	acquiredPayload["holderSessionID"] = requesterSessionID
	acquiredPayload["handoffGranted"] = true
	return &ClaimHandoffOutput{Status: http.StatusOK, Payload: acquiredPayload}, nil
}

// WaitlistPulse refreshes the requester's waitlist pulse key.
func (s *Service) WaitlistPulse(ctx context.Context, accountID, sessionID, collection, docID string) error {
	if s.Deps.Redis == nil {
		return ErrLocksUnavailable
	}
	return TouchWaitlistPulse(ctx, s.Deps.Redis, accountID, collection, docID, sessionID)
}
