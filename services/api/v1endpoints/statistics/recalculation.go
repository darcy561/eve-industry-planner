package statistics

import (
	"context"

	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"
)

// recalculationEnvelope carries what a read can tell a client about work the
// figures are waiting on.
//
// Embedded in every statistics response rather than served from an endpoint of
// its own: a client learns the figures are being rebuilt from the same request
// that returned them, so there is no window where it has drawn one and not yet
// asked about the other. Absent when there is nothing to say, so a current
// account pays no bytes for it.
type recalculationEnvelope struct {
	Recalculation eipmongo.RecalculationState `json:"recalculation,omitempty"`
}

// recalculationFor reads whether an account is waiting on a rebuild.
//
// A failure to read it is not a failure to serve the figures: the figures are
// what was asked for, and the worst case is a client that is not told they are
// being replaced. It is logged and the response says nothing.
func recalculationFor(ctx context.Context, mongo *eipmongo.Mongo, accountID string) recalculationEnvelope {
	if mongo == nil || accountID == "" {
		return recalculationEnvelope{}
	}
	state, err := mongo.OwnerRecalculationState(ctx, models.AccountStatsOwner(accountID))
	if err != nil {
		logs.WarnCtx(ctx, "recalculation state unread",
			"component", "statistics", "error", err)
		return recalculationEnvelope{}
	}
	return recalculationEnvelope{Recalculation: state}
}
