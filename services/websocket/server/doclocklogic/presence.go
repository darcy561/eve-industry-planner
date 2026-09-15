package doclocklogic

import (
	"context"
	"errors"

	"eve-industry-planner/shared/core/documentlock"
	"eve-industry-planner/shared/models"
)

// WaitlistPulse runs the domain waitlist pulse for one planner/session/doc.
func WaitlistPulse(ctx context.Context, deps documentlock.Deps, owner models.Owner, sessionID, collection, docID string) Outcome {
	if deps.Redis.Driver() == nil {
		return fail("document locks unavailable", documentlock.FailureUnavailable, documentlock.ErrLocksUnavailable, nil)
	}
	svc := documentlock.NewService(deps)
	if err := svc.WaitlistPulse(ctx, owner, sessionID, collection, docID); err != nil {
		if errors.Is(err, documentlock.ErrLocksUnavailable) {
			return fail("document locks unavailable", documentlock.FailureUnavailable, err, nil)
		}
		return fail("document lock waitlist-pulse failed", documentlock.FailureWaitlistPulseFailed, err, nil)
	}
	return Outcome{}
}

// ViewerArrived runs viewer-arrived ingress (best-effort domain side effects).
func ViewerArrived(ctx context.Context, deps documentlock.Deps, owner models.Owner, sessionID, collection, docID string) {
	documentlock.HandleViewerArrivedIngress(ctx, deps, owner, sessionID, collection, docID)
}

// ViewerDeparted runs viewer-departed ingress.
func ViewerDeparted(ctx context.Context, deps documentlock.Deps, owner models.Owner, sessionID, collection, docID string) {
	documentlock.HandleViewerDepartedIngress(ctx, deps, owner, sessionID, collection, docID)
}
