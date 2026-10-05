package documentlock

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"eve-industry-planner/shared/models"
)

// AcquireResult is the outcome of attempting to acquire the edit lock.
type AcquireResult struct {
	StatusCode int
	Payload    map[string]any
}

// Acquire grants the lock when uncontested or returns contended payload when another session holds
// it.
func (s *Service) Acquire(ctx context.Context, owner models.Owner, accountID, sessionID, collection, docID string) (*AcquireResult, error) {
	rdb := s.Deps.Redis
	if rdb.Driver() == nil {
		return nil, ErrLocksUnavailable
	}
	now := time.Now().Unix()

	tx, err := runAcquireTx(ctx, rdb, owner, accountID, sessionID, collection, docID, now, ContestedLockTTLSeconds(), SoloLockTTLSeconds())
	if err != nil {
		return nil, err
	}

	switch tx.Outcome {
	case "contended":
		payload := LockPayload(tx.Record.ExpiresAtUnix)
		payload["held"] = true
		payload["acquired"] = false
		payload["holderParticipantID"] = ParticipantID(tx.Record.HolderSessionID)
		if vc, vcErr := PruneAndCountViewers(ctx, rdb, owner, collection, docID); vcErr == nil {
			payload["viewerCount"] = vc
		}
		return &AcquireResult{StatusCode: http.StatusOK, Payload: payload}, nil

	case "granted":
		StripPassiveViewerOnHolderGrant(ctx, s.Deps, owner, collection, docID, sessionID, true)
		_ = PublishLockEvent(ctx, s.Deps.NATS, owner, map[string]any{
			LockPayloadEventKey: LockEventAcquired,
			"collection":        collection,
			"docID":             docID,
			"participantID":     ParticipantID(sessionID),
			"expiresAtUnix":     tx.Record.ExpiresAtUnix,
		})
		payload := LockPayloadForRecord(tx.Record.ExpiresAtUnix, tx.Record.LeaseMode)
		payload["acquired"] = true
		payload["held"] = true
		payload["holderParticipantID"] = ParticipantID(sessionID)
		return &AcquireResult{StatusCode: http.StatusCreated, Payload: payload}, nil

	default:
		return nil, fmt.Errorf("acquire tx: unexpected outcome %q", tx.Outcome)
	}
}

// ExtendResult is returned by Extend for the holder renew / handoff-probe paths.
type ExtendResult struct {
	StatusCode       int
	ExpiresAtUnix    int64
	ExtendCount      int
	Extras           ExtendExtras
	NotHolderPayload map[string]any
}

// Extend renews the lease for the current holder, runs the renew→probe cycle state machine, or
// returns a not-holder JSON.
func (s *Service) Extend(ctx context.Context, owner models.Owner, sessionID, collection, docID string) (*ExtendResult, error) {
	rdb := s.Deps.Redis
	if rdb.Driver() == nil {
		return nil, ErrLocksUnavailable
	}
	now := time.Now().Unix()
	ttlSeconds := int64(DefaultLockTTL / time.Second)
	pulseTTLSeconds := int64(WaitlistPulseTTL / time.Second)

	tx, err := runExtendTx(
		ctx, rdb,
		owner, sessionID, collection, docID,
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
		payload["holderParticipantID"] = ParticipantID(tx.Record.HolderSessionID)
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
			_ = PublishLockEvent(ctx, s.Deps.NATS, owner, map[string]any{
				LockPayloadEventKey:        LockEventHandoffProbe,
				"collection":               collection,
				"docID":                    docID,
				"probeTargetParticipantID": ParticipantID(tx.ProbeTargetSessionID),
				"holderParticipantID":      ParticipantID(sessionID),
				"probeExpiresAtUnix":       tx.ProbeExpiresAtUnix,
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
func (s *Service) Release(ctx context.Context, owner models.Owner, sessionID, collection, docID string) error {
	rdb := s.Deps.Redis
	if rdb.Driver() == nil {
		return ErrLocksUnavailable
	}
	now := time.Now().Unix()

	tx, err := runReleaseTx(ctx, rdb, owner, sessionID, collection, docID, now)
	if err != nil {
		return err
	}
	if tx.Outcome != "released" {
		return nil
	}
	_ = PublishLockEvent(ctx, s.Deps.NATS, owner, map[string]any{
		LockPayloadEventKey: LockEventReleased,
		"collection":        collection,
		"docID":             docID,
		"participantID":     ParticipantID(sessionID),
		"reason":            LockReleaseReasonHolderRelease,
	})
	return nil
}

// ForceReleaseSameAccount removes the lock when it is held by a *different* session of the caller's
// own account and atomically grants it to the caller.
func (s *Service) ForceReleaseSameAccount(ctx context.Context, owner models.Owner, accountID, requesterSessionID, collection, docID string) (*AcquireResult, error) {
	rdb := s.Deps.Redis
	if rdb.Driver() == nil {
		return nil, ErrLocksUnavailable
	}
	now := time.Now().Unix()
	tx, err := runForceReleaseSameAccountTx(ctx, rdb, owner, accountID, requesterSessionID, collection, docID, now, SoloLockTTLSeconds())
	if err != nil {
		return nil, err
	}
	switch tx.Outcome {
	case "noop_no_lock":
		return nil, ErrForceReleaseNoLock
	case "noop_other_account":
		return nil, ErrForceReleaseOtherAccount
	case "noop_same_holder":
		return nil, ErrForceReleaseSameSession
	case "released":
		prev := tx.PreviousHolderSessionID
		_ = PublishLockEvent(ctx, s.Deps.NATS, owner, map[string]any{
			LockPayloadEventKey:      LockEventReleased,
			"collection":             collection,
			"docID":                  docID,
			"participantID":          ParticipantID(prev),
			"requesterParticipantID": ParticipantID(requesterSessionID),
			"reason":                 LockReleaseReasonForceReleasedSameAccount,
		})
		StripPassiveViewerOnHolderGrant(ctx, s.Deps, owner, collection, docID, requesterSessionID, true)
		_ = PublishLockEvent(ctx, s.Deps.NATS, owner, map[string]any{
			LockPayloadEventKey: LockEventAcquired,
			"collection":        collection,
			"docID":             docID,
			"participantID":     ParticipantID(requesterSessionID),
			"expiresAtUnix":     tx.Record.ExpiresAtUnix,
		})
		payload := LockPayloadForRecord(tx.Record.ExpiresAtUnix, tx.Record.LeaseMode)
		payload["acquired"] = true
		payload["held"] = true
		payload["holderParticipantID"] = ParticipantID(requesterSessionID)
		return &AcquireResult{StatusCode: http.StatusCreated, Payload: payload}, nil
	default:
		return nil, fmt.Errorf("force-release same-account: unexpected outcome %q", tx.Outcome)
	}
}

// HandOverResult is the outcome of the holder accepting the waitlist head.
type HandOverResult struct {
	StatusCode              int
	Payload                 map[string]any
	PreviousHolderSessionID string
	NewHolderSessionID      string
}

// HandOver atomically transfers the lock to the alive waitlist head, or releases when no waitlist
// head is alive.
func (s *Service) HandOver(ctx context.Context, owner models.Owner, holderSessionID, collection, docID string) (*HandOverResult, error) {
	rdb := s.Deps.Redis
	if rdb.Driver() == nil {
		return nil, ErrLocksUnavailable
	}
	now := time.Now().Unix()
	ttlSeconds := int64(DefaultLockTTL / time.Second)

	tx, err := runHandOverTx(ctx, rdb, owner, holderSessionID, collection, docID, now, ttlSeconds)
	if err != nil {
		return nil, err
	}

	switch tx.Outcome {
	case "noop":
		return &HandOverResult{
			StatusCode: http.StatusConflict,
			Payload: map[string]any{
				"error": ErrCodeHandOverNoop,
			},
		}, nil

	case "released_no_queue":
		_ = PublishLockEvent(ctx, s.Deps.NATS, owner, map[string]any{
			LockPayloadEventKey: LockEventReleased,
			"collection":        collection,
			"docID":             docID,
			"participantID":     ParticipantID(holderSessionID),
			"reason":            LockReleaseReasonHandOverNoQueue,
		})
		return &HandOverResult{
			StatusCode:              http.StatusNoContent,
			PreviousHolderSessionID: holderSessionID,
		}, nil

	case "promoted":
		StripPassiveViewerOnHolderGrant(ctx, s.Deps, owner, collection, docID, tx.NewHolderSessionID, true)
		_ = PublishLockEvent(ctx, s.Deps.NATS, owner, BuildHandoffCompletedPayload(
			collection,
			docID,
			tx.NewHolderSessionID,
			tx.ExpiresAtUnix,
			HandoffCompletedOpts{
				PreviousHolderSessionID: tx.PreviousHolderSessionID,
				Reason:                  LockHandoffReasonHolderHandover,
			},
		))
		payload := LockPayload(tx.ExpiresAtUnix)
		payload["held"] = true
		payload["holderParticipantID"] = ParticipantID(tx.NewHolderSessionID)
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

// RequestAccess auto-grants the lock when empty, returns same-holder when the requester already
// holds it, or enqueues with a fresh pulse.
func (s *Service) RequestAccess(ctx context.Context, owner models.Owner, accountID, requesterSessionID, collection, docID string) (*RequestLockResult, error) {
	rdb := s.Deps.Redis
	if rdb.Driver() == nil {
		return nil, ErrLocksUnavailable
	}
	now := time.Now().Unix()
	ttlSeconds := int64(DefaultLockTTL / time.Second)
	pulseTTLSeconds := int64(WaitlistPulseTTL / time.Second)

	tx, err := runRequestAccessTx(ctx, rdb, owner, accountID, requesterSessionID, collection, docID, now, ttlSeconds, pulseTTLSeconds)
	if err != nil {
		return nil, err
	}

	switch tx.Outcome {
	case "granted_empty":
		StripPassiveViewerOnHolderGrant(ctx, s.Deps, owner, collection, docID, requesterSessionID, true)
		_ = PublishLockEvent(ctx, s.Deps.NATS, owner, map[string]any{
			LockPayloadEventKey:    LockEventAcquired,
			"collection":           collection,
			"docID":                docID,
			"participantID":        ParticipantID(requesterSessionID),
			"expiresAtUnix":        tx.ExpiresAtUnix,
			"accessRequestGranted": true,
		})
		payload := LockPayload(tx.ExpiresAtUnix)
		payload["acquired"] = true
		payload["held"] = true
		payload["holderParticipantID"] = ParticipantID(requesterSessionID)
		payload["accessRequestGranted"] = true
		return &RequestLockResult{StatusCode: http.StatusCreated, Payload: payload}, nil

	case "same_holder":
		payload := LockPayload(tx.Record.ExpiresAtUnix)
		payload["acquired"] = true
		payload["held"] = true
		payload["holderParticipantID"] = ParticipantID(requesterSessionID)
		payload["accessRequestGranted"] = true
		return &RequestLockResult{StatusCode: http.StatusOK, Payload: payload}, nil

	case "queued":
		_ = PublishLockEvent(ctx, s.Deps.NATS, owner, map[string]any{
			LockPayloadEventKey:      LockEventRequested,
			"collection":             collection,
			"docID":                  docID,
			"requesterParticipantID": ParticipantID(requesterSessionID),
		})
		return &RequestLockResult{StatusCode: http.StatusAccepted, Payload: nil}, nil

	default:
		return nil, fmt.Errorf("request-access tx: unexpected outcome %q", tx.Outcome)
	}
}

// ClaimHandoffOutput is the outcome of POST /claim-handoff.
type ClaimHandoffOutput struct {
	Status                  int
	Payload                 map[string]any
	ErrText                 string
	PreviousHolderSessionID string
	NewHolderSessionID      string
}

// ClaimHandoff completes a probe-driven handoff for the queued session.
func (s *Service) ClaimHandoff(ctx context.Context, owner models.Owner, accountID, requesterSessionID, collection, docID string) (*ClaimHandoffOutput, error) {
	rdb := s.Deps.Redis
	if rdb.Driver() == nil {
		return nil, ErrLocksUnavailable
	}
	now := time.Now().Unix()
	ttlSeconds := int64(DefaultLockTTL / time.Second)
	pulseTTLSeconds := int64(WaitlistPulseTTL / time.Second)

	tx, err := runClaimHandoffTx(ctx, rdb, owner, accountID, requesterSessionID, collection, docID, now, ttlSeconds, pulseTTLSeconds)
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
		StripPassiveViewerOnHolderGrant(ctx, s.Deps, owner, collection, docID, tx.NewHolderSessionID, true)
		_ = PublishLockEvent(ctx, s.Deps.NATS, owner, BuildHandoffCompletedPayload(
			collection,
			docID,
			tx.NewHolderSessionID,
			tx.ExpiresAtUnix,
			HandoffCompletedOpts{PreviousHolderSessionID: tx.PreviousHolderSessionID},
		))
		payload := LockPayload(tx.ExpiresAtUnix)
		payload["acquired"] = true
		payload["held"] = true
		payload["holderParticipantID"] = ParticipantID(tx.NewHolderSessionID)
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
func (s *Service) WaitlistPulse(ctx context.Context, owner models.Owner, sessionID, collection, docID string) error {
	if s.Deps.Redis.Driver() == nil {
		return ErrLocksUnavailable
	}
	return TouchWaitlistPulse(ctx, s.Deps.Redis, owner, collection, docID, sessionID)
}
