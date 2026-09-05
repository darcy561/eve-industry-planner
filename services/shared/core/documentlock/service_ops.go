package documentlock

import (
	"context"
	"fmt"
	"net/http"
	"time"

	eipmongo "eve-industry-planner/shared/mongo"
)

// AcquireResult is the outcome of attempting to acquire the edit lock.
type AcquireResult struct {
	StatusCode int
	Payload    map[string]any
}

// Acquire grants the lock when uncontested or returns contended payload when
// another session holds it. The grant/contended decision happens inside a
// single Redis EVAL so two simultaneous Acquires cannot both win.
func (s *Service) Acquire(ctx context.Context, accountID, sessionID, collection, docID string) (*AcquireResult, error) {
	rdb := s.Deps.Redis
	if rdb == nil {
		return nil, ErrLocksUnavailable
	}
	now := time.Now().Unix()

	tx, err := runAcquireTx(ctx, rdb, accountID, sessionID, collection, docID, now, ContestedLockTTLSeconds(), SoloLockTTLSeconds())
	if err != nil {
		return nil, err
	}

	switch tx.Outcome {
	case "contended":
		payload := LockPayload(tx.Record.ExpiresAtUnix)
		payload["held"] = true
		payload["acquired"] = false
		payload["holderSessionID"] = tx.Record.HolderSessionID
		if vc, vcErr := PruneAndCountViewers(ctx, rdb, accountID, collection, docID); vcErr == nil {
			payload["viewerCount"] = vc
		}
		return &AcquireResult{StatusCode: http.StatusOK, Payload: payload}, nil

	case "granted":
		StripPassiveViewerOnHolderGrant(ctx, s.Deps, accountID, collection, docID, sessionID, true)
		_ = PublishLockEvent(ctx, s.Deps.NATS, accountID, map[string]any{
			LockPayloadEventKey: LockEventAcquired,
			"collection":        collection,
			"docID":             docID,
			"sessionID":         sessionID,
			"expiresAtUnix":     tx.Record.ExpiresAtUnix,
		})
		if collection == eipmongo.CollectionJobGroups {
			ReleaseStaleDependentJobLocksAfterGroupGrant(ctx, s.Deps, accountID, docID, sessionID)
		}
		payload := LockPayloadForRecord(tx.Record.ExpiresAtUnix, tx.Record.LeaseMode)
		payload["acquired"] = true
		payload["held"] = true
		payload["holderSessionID"] = sessionID
		return &AcquireResult{StatusCode: http.StatusCreated, Payload: payload}, nil

	default:
		return nil, fmt.Errorf("acquire tx: unexpected outcome %q", tx.Outcome)
	}
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

// Extend renews the lease for the current holder, runs the renew→probe cycle
// state machine, or returns a not-holder JSON. Cycle decisions (extend count,
// probe target selection, probe expiry sweep) all happen inside a single EVAL.
func (s *Service) Extend(ctx context.Context, accountID, sessionID, collection, docID string) (*ExtendResult, error) {
	rdb := s.Deps.Redis
	if rdb == nil {
		return nil, ErrLocksUnavailable
	}
	now := time.Now().Unix()
	ttlSeconds := int64(DefaultLockTTL / time.Second)
	pulseTTLSeconds := int64(WaitlistPulseTTL / time.Second)

	tx, err := runExtendTx(
		ctx, rdb,
		accountID, sessionID, collection, docID,
		now, ttlSeconds,
		int64(MaxExtensionsBeforeHandoffConsult),
		ProbeAckWaitSeconds,
		pulseTTLSeconds,
		SoloLockTTLSeconds(),
	)
	if err != nil {
		return nil, err
	}

	switch tx.Outcome {
	case "not_holder_absent":
		return &ExtendResult{
			StatusCode: http.StatusOK,
			NotHolderPayload: map[string]any{
				"holding": false,
				"held":    false,
			},
		}, nil

	case "not_holder_other":
		payload := LockPayload(tx.Record.ExpiresAtUnix)
		payload["holding"] = false
		payload["held"] = true
		payload["holderSessionID"] = tx.Record.HolderSessionID
		return &ExtendResult{StatusCode: http.StatusOK, NotHolderPayload: payload}, nil

	case "extended":
		return &ExtendResult{
			StatusCode:    http.StatusOK,
			ExpiresAtUnix: tx.ExpiresAtUnix,
			ExtendCount:   tx.ExtendCount,
			Extras:        ExtendExtras{HandoffPending: false},
		}, nil

	case "probe_pending":
		return &ExtendResult{
			StatusCode:    http.StatusOK,
			ExpiresAtUnix: tx.ExpiresAtUnix,
			ExtendCount:   tx.ExtendCount,
			Extras: ExtendExtras{
				HandoffPending:       true,
				ProbeTargetSessionID: tx.ProbeTargetSessionID,
				ProbeExpiresAtUnix:   tx.ProbeExpiresAtUnix,
			},
		}, nil

	case "cycle_reset":
		return &ExtendResult{
			StatusCode:    http.StatusOK,
			ExpiresAtUnix: tx.ExpiresAtUnix,
			ExtendCount:   0,
			Extras:        ExtendExtras{HandoffPending: false, CycleReset: true},
		}, nil

	case "probe_set":
		if tx.PublishProbe {
			_ = PublishLockEvent(ctx, s.Deps.NATS, accountID, map[string]any{
				LockPayloadEventKey:    LockEventHandoffProbe,
				"collection":           collection,
				"docID":                docID,
				"probeTargetSessionID": tx.ProbeTargetSessionID,
				"holderSessionID":      sessionID,
				"probeExpiresAtUnix":   tx.ProbeExpiresAtUnix,
			})
		}
		return &ExtendResult{
			StatusCode:    http.StatusOK,
			ExpiresAtUnix: tx.ExpiresAtUnix,
			ExtendCount:   tx.ExtendCount,
			Extras: ExtendExtras{
				HandoffPending:       true,
				ProbeTargetSessionID: tx.ProbeTargetSessionID,
				ProbeExpiresAtUnix:   tx.ProbeExpiresAtUnix,
			},
		}, nil

	default:
		return nil, fmt.Errorf("extend tx: unexpected outcome %q", tx.Outcome)
	}
}

// Release drops the lock when the caller is the holder (no-op otherwise).
// The holder check and DEL happen inside a single EVAL so we never delete a
// lock that has been rebound to a different session between the read and the
// write.
func (s *Service) Release(ctx context.Context, accountID, sessionID, collection, docID string) error {
	rdb := s.Deps.Redis
	if rdb == nil {
		return ErrLocksUnavailable
	}
	now := time.Now().Unix()

	tx, err := runReleaseTx(ctx, rdb, accountID, sessionID, collection, docID, now)
	if err != nil {
		return err
	}
	if tx.Outcome != "released" {
		return nil
	}
	_ = PublishLockEvent(ctx, s.Deps.NATS, accountID, map[string]any{
		LockPayloadEventKey: LockEventReleased,
		"collection":        collection,
		"docID":             docID,
		"sessionID":         sessionID,
		"reason":            LockReleaseReasonHolderRelease,
	})
	return nil
}

// ForceReleaseSameAccount removes the lock when it is held by a *different*
// session on the same account (JWT accountID) and atomically grants it to the
// caller. The caller must not already be the holder — use Release instead.
// Publishes `document_lock_released` (evicted holder) then `document_lock_acquired`
// (caller). For group locks, cascades per-job locks on handoff and grant.
func (s *Service) ForceReleaseSameAccount(ctx context.Context, accountID, requesterSessionID, collection, docID string) (*AcquireResult, error) {
	rdb := s.Deps.Redis
	if rdb == nil {
		return nil, ErrLocksUnavailable
	}
	now := time.Now().Unix()
	tx, err := runForceReleaseSameAccountTx(ctx, rdb, accountID, requesterSessionID, collection, docID, now, SoloLockTTLSeconds())
	if err != nil {
		return nil, err
	}
	switch tx.Outcome {
	case "noop_no_lock":
		return nil, ErrForceReleaseNoLock
	case "noop_same_holder":
		return nil, ErrForceReleaseSameSession
	case "released":
		prev := tx.PreviousHolderSessionID
		_ = PublishLockEvent(ctx, s.Deps.NATS, accountID, map[string]any{
			LockPayloadEventKey:  LockEventReleased,
			"collection":         collection,
			"docID":              docID,
			"sessionID":          prev,
			"requesterSessionID": requesterSessionID,
			"reason":             LockReleaseReasonForceReleasedSameAccount,
		})
		if collection == eipmongo.CollectionJobGroups {
			ReleaseDependentJobLocksOnGroupHandoff(ctx, s.Deps, accountID, docID, prev)
		}
		StripPassiveViewerOnHolderGrant(ctx, s.Deps, accountID, collection, docID, requesterSessionID, true)
		_ = PublishLockEvent(ctx, s.Deps.NATS, accountID, map[string]any{
			LockPayloadEventKey: LockEventAcquired,
			"collection":        collection,
			"docID":             docID,
			"sessionID":         requesterSessionID,
			"expiresAtUnix":     tx.Record.ExpiresAtUnix,
		})
		if collection == eipmongo.CollectionJobGroups {
			ReleaseStaleDependentJobLocksAfterGroupGrant(ctx, s.Deps, accountID, docID, requesterSessionID)
		}
		payload := LockPayloadForRecord(tx.Record.ExpiresAtUnix, tx.Record.LeaseMode)
		payload["acquired"] = true
		payload["held"] = true
		payload["holderSessionID"] = requesterSessionID
		return &AcquireResult{StatusCode: http.StatusCreated, Payload: payload}, nil
	default:
		return nil, fmt.Errorf("force-release same-account: unexpected outcome %q", tx.Outcome)
	}
}

// HandOverResult is the outcome of the holder accepting the waitlist head.
type HandOverResult struct {
	StatusCode              int
	Payload                 map[string]any // nil for 204 responses
	PreviousHolderSessionID string
	NewHolderSessionID      string
}

// HandOver atomically transfers the lock to the alive waitlist head, or
// releases when no waitlist head is alive. Holder check + waitlist walk +
// transfer all happen in a single EVAL so two concurrent HandOvers cannot
// double-promote.
func (s *Service) HandOver(ctx context.Context, accountID, holderSessionID, collection, docID string) (*HandOverResult, error) {
	rdb := s.Deps.Redis
	if rdb == nil {
		return nil, ErrLocksUnavailable
	}
	now := time.Now().Unix()
	ttlSeconds := int64(DefaultLockTTL / time.Second)

	tx, err := runHandOverTx(ctx, rdb, accountID, holderSessionID, collection, docID, now, ttlSeconds)
	if err != nil {
		return nil, err
	}

	switch tx.Outcome {
	case "noop":
		// Distinguish from `released_no_queue` (also historically ambiguous with 204).
		// SPA treats 409 as "still holder or race — do not optimistically drop edit state".
		return &HandOverResult{
			StatusCode: http.StatusConflict,
			Payload: map[string]any{
				"error": ErrCodeHandOverNoop,
			},
		}, nil

	case "released_no_queue":
		_ = PublishLockEvent(ctx, s.Deps.NATS, accountID, map[string]any{
			LockPayloadEventKey: LockEventReleased,
			"collection":        collection,
			"docID":             docID,
			"sessionID":         holderSessionID,
			"reason":            LockReleaseReasonHandOverNoQueue,
		})
		return &HandOverResult{
			StatusCode:              http.StatusNoContent,
			PreviousHolderSessionID: holderSessionID,
		}, nil

	case "promoted":
		StripPassiveViewerOnHolderGrant(ctx, s.Deps, accountID, collection, docID, tx.NewHolderSessionID, true)
		_ = PublishLockEvent(ctx, s.Deps.NATS, accountID, BuildHandoffCompletedPayload(
			collection,
			docID,
			tx.NewHolderSessionID,
			tx.ExpiresAtUnix,
			HandoffCompletedOpts{
				PreviousHolderSessionID: tx.PreviousHolderSessionID,
				Reason:                  LockHandoffReasonHolderHandover,
			},
		))
		if collection == eipmongo.CollectionJobGroups {
			ReleaseDependentJobLocksOnGroupHandoff(ctx, s.Deps, accountID, docID, tx.PreviousHolderSessionID)
		}
		payload := LockPayload(tx.ExpiresAtUnix)
		payload["held"] = true
		payload["holderSessionID"] = tx.NewHolderSessionID
		payload["handoffGranted"] = true
		return &HandOverResult{
			StatusCode:              http.StatusOK,
			Payload:                 payload,
			PreviousHolderSessionID: tx.PreviousHolderSessionID,
			NewHolderSessionID:      tx.NewHolderSessionID,
		}, nil

	default:
		return nil, fmt.Errorf("hand-over tx: unexpected outcome %q", tx.Outcome)
	}
}

// RequestLockResult is the outcome of POST /request (queue, auto-grant, or same-holder refresh).
type RequestLockResult struct {
	StatusCode int
	Payload    map[string]any
}

// RequestAccess auto-grants the lock when empty, returns same-holder when the
// requester already holds it, or enqueues with a fresh pulse. All decisions
// (auto-grant vs. enqueue vs. same-holder) are made inside a single EVAL.
func (s *Service) RequestAccess(ctx context.Context, accountID, requesterSessionID, collection, docID string) (*RequestLockResult, error) {
	rdb := s.Deps.Redis
	if rdb == nil {
		return nil, ErrLocksUnavailable
	}
	now := time.Now().Unix()
	ttlSeconds := int64(DefaultLockTTL / time.Second)
	pulseTTLSeconds := int64(WaitlistPulseTTL / time.Second)

	tx, err := runRequestAccessTx(ctx, rdb, accountID, requesterSessionID, collection, docID, now, ttlSeconds, pulseTTLSeconds)
	if err != nil {
		return nil, err
	}

	switch tx.Outcome {
	case "granted_empty":
		StripPassiveViewerOnHolderGrant(ctx, s.Deps, accountID, collection, docID, requesterSessionID, true)
		_ = PublishLockEvent(ctx, s.Deps.NATS, accountID, map[string]any{
			LockPayloadEventKey:    LockEventAcquired,
			"collection":           collection,
			"docID":                docID,
			"sessionID":            requesterSessionID,
			"expiresAtUnix":        tx.ExpiresAtUnix,
			"accessRequestGranted": true,
		})
		if collection == eipmongo.CollectionJobGroups {
			ReleaseStaleDependentJobLocksAfterGroupGrant(ctx, s.Deps, accountID, docID, requesterSessionID)
		}
		payload := LockPayload(tx.ExpiresAtUnix)
		payload["acquired"] = true
		payload["held"] = true
		payload["holderSessionID"] = requesterSessionID
		payload["accessRequestGranted"] = true
		return &RequestLockResult{StatusCode: http.StatusCreated, Payload: payload}, nil

	case "same_holder":
		payload := LockPayload(tx.Record.ExpiresAtUnix)
		payload["acquired"] = true
		payload["held"] = true
		payload["holderSessionID"] = requesterSessionID
		payload["accessRequestGranted"] = true
		return &RequestLockResult{StatusCode: http.StatusOK, Payload: payload}, nil

	case "queued":
		_ = PublishLockEvent(ctx, s.Deps.NATS, accountID, map[string]any{
			LockPayloadEventKey:  LockEventRequested,
			"collection":         collection,
			"docID":              docID,
			"requesterSessionID": requesterSessionID,
		})
		return &RequestLockResult{StatusCode: http.StatusAccepted, Payload: nil}, nil

	default:
		return nil, fmt.Errorf("request-access tx: unexpected outcome %q", tx.Outcome)
	}
}

// ClaimHandoffOutput is the outcome of POST /claim-handoff.
type ClaimHandoffOutput struct {
	Status                  int
	Payload                 map[string]any // set only for 200
	ErrText                 string         // plain HTTP error body for non-200 (4xx)
	PreviousHolderSessionID string
	NewHolderSessionID      string
}

// ClaimHandoff completes a probe-driven handoff for the queued session. The
// probe validation (target == requester, probe not expired, waitlist head is
// requester) plus the lock rewrite all happen inside a single EVAL.
func (s *Service) ClaimHandoff(ctx context.Context, accountID, requesterSessionID, collection, docID string) (*ClaimHandoffOutput, error) {
	rdb := s.Deps.Redis
	if rdb == nil {
		return nil, ErrLocksUnavailable
	}
	now := time.Now().Unix()
	ttlSeconds := int64(DefaultLockTTL / time.Second)
	pulseTTLSeconds := int64(WaitlistPulseTTL / time.Second)

	tx, err := runClaimHandoffTx(ctx, rdb, accountID, requesterSessionID, collection, docID, now, ttlSeconds, pulseTTLSeconds)
	if err != nil {
		return nil, err
	}

	switch tx.Outcome {
	case "lock_inactive":
		return &ClaimHandoffOutput{Status: http.StatusConflict, ErrText: "Lock inactive"}, nil
	case "no_active_probe":
		return &ClaimHandoffOutput{Status: http.StatusConflict, ErrText: "No active probe for this session"}, nil
	case "already_editing":
		return &ClaimHandoffOutput{Status: http.StatusBadRequest, ErrText: "Already editing"}, nil
	case "not_next_in_queue":
		return &ClaimHandoffOutput{Status: http.StatusConflict, ErrText: "No longer next in queue"}, nil
	case "granted":
		StripPassiveViewerOnHolderGrant(ctx, s.Deps, accountID, collection, docID, tx.NewHolderSessionID, true)
		_ = PublishLockEvent(ctx, s.Deps.NATS, accountID, BuildHandoffCompletedPayload(
			collection,
			docID,
			tx.NewHolderSessionID,
			tx.ExpiresAtUnix,
			HandoffCompletedOpts{PreviousHolderSessionID: tx.PreviousHolderSessionID},
		))
		if collection == eipmongo.CollectionJobGroups {
			ReleaseDependentJobLocksOnGroupHandoff(ctx, s.Deps, accountID, docID, tx.PreviousHolderSessionID)
		}
		payload := LockPayload(tx.ExpiresAtUnix)
		payload["acquired"] = true
		payload["held"] = true
		payload["holderSessionID"] = tx.NewHolderSessionID
		payload["handoffGranted"] = true
		return &ClaimHandoffOutput{
			Status:                  http.StatusOK,
			Payload:                 payload,
			PreviousHolderSessionID: tx.PreviousHolderSessionID,
			NewHolderSessionID:      tx.NewHolderSessionID,
		}, nil
	default:
		return nil, fmt.Errorf("claim-handoff tx: unexpected outcome %q", tx.Outcome)
	}
}

// WaitlistPulse refreshes the requester's waitlist pulse key.
func (s *Service) WaitlistPulse(ctx context.Context, accountID, sessionID, collection, docID string) error {
	if s.Deps.Redis == nil {
		return ErrLocksUnavailable
	}
	return TouchWaitlistPulse(ctx, s.Deps.Redis, accountID, collection, docID, sessionID)
}
