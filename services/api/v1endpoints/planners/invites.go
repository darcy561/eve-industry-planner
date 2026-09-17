package planners

import (
	"context"
	"errors"
	"net/http"
	"time"

	"eve-industry-planner/api/helper"
	"eve-industry-planner/api/plannerinvites"
	"eve-industry-planner/shared/models"
	"eve-industry-planner/shared/models/planner"
	"eve-industry-planner/shared/telemetry/apimetrics"

	"github.com/google/uuid"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

// DefaultInviteLifetime is how long an invite lasts when the caller names no
// expiry.
const DefaultInviteLifetime = 7 * 24 * time.Hour

// issueInviteRequest is what a caller may choose about an invite. Nothing here
// widens what it grants, which is one membership row and nothing else.
type issueInviteRequest struct {
	MaxUses        int    `json:"maxUses,omitzero"`
	BoundAccountID string `json:"boundAccountID,omitempty"`
	ExpiresInHours int    `json:"expiresInHours,omitzero"`
}

// issueInviteResponse carries the token, which is shown once and never stored.
type issueInviteResponse struct {
	Invite planner.InviteSummary `json:"invite"`
	Token  string                `json:"token"`
}

type listInvitesResponse struct {
	Invites []planner.InviteSummary `json:"invites"`
}

func inviteMetrics(ctx context.Context) *helper.RequestMetricsTracker {
	m := apimetrics.GetAPIPlanners()
	return helper.BeginRequestMetrics(ctx, helper.RequestMetricsHooks{
		ObserveDuration: func(ctx context.Context, ms float64) { m.Requests.Observe(ctx, ms) },
		IncRequests:     func(ctx context.Context) { m.RequestsCount.Inc(ctx) },
		IncSuccesses:    func(ctx context.Context) { m.Successes.Inc(ctx) },
		IncErrors:       func(ctx context.Context, reason string) { m.Errors.WithLabelValues(reason).Inc(ctx) },
	})
}

// plannerCreatorOnly resolves the planner a request names and refuses anyone but
// the account that created it.
//
// Refused as 404 rather than 403: a member who may not invite learns the route
// is not theirs, not that it exists for somebody else.
func (h *Handlers) plannerCreatorOnly(w http.ResponseWriter, r *http.Request, handle, route string,
	metrics *helper.RequestMetricsTracker) (planner.Planner, models.Owner, bool) {
	owner, ok := helper.PlannerOwnerFromHandle(w, r, handle, h.Mongo, h.EntityCipher, metrics, route)
	if !ok {
		return planner.Planner{}, models.Owner{}, false
	}

	// Only a custom planner admits by invite. An account planner has one member,
	// and a corporation or alliance roster follows the entity — a row written
	// here would outlive the membership the game says they have.
	if !owner.AdmitsByInvite() {
		metrics.Error("kind_admits_no_invite")
		helper.RespondEndpointError(w, r, http.StatusConflict,
			"This planner does not take invites",
			"planner invite: refused a planner whose members are not invited",
			"planner_invite_wrong_kind", route, nil,
			map[string]any{"owner_kind": string(owner.Kind)})
		return planner.Planner{}, models.Owner{}, false
	}

	stored, err := h.Mongo.LoadPlanner(r.Context(), owner)
	if errors.Is(err, mongo.ErrNoDocuments) {
		// A corporation an account is in but nobody has opened has a membership
		// row and no planner, so this is an unnamed planner rather than a fault.
		metrics.Error("no_such_planner")
		helper.RespondEndpointError(w, r, http.StatusNotFound, "Not found",
			"planner invite: the planner has no document", "planner_invite_no_planner",
			route, nil, nil)
		return planner.Planner{}, models.Owner{}, false
	}
	if err != nil {
		metrics.Error("database_error")
		helper.RespondEndpointServerError(w, r, "Failed to read planner",
			"planner invite: read planner failed", "planner_invite_read_failed", route, err, nil)
		return planner.Planner{}, models.Owner{}, false
	}
	if stored.CreatedBy != helper.AuthenticatedAccountID(r) {
		metrics.Error("not_the_creator")
		helper.RespondEndpointError(w, r, http.StatusNotFound, "Not found",
			"planner invite: refused an account that did not create the planner",
			"planner_invite_not_creator", route, nil, nil)
		return planner.Planner{}, models.Owner{}, false
	}
	return stored, owner, true
}

// PostPlannerInviteHandler handles POST /api/v1/planners/{ownerHandle}/invites.
//
// Only the account that created the planner may invite into it: that is the one
// permission this needs, and it is answered without a permission model.
func (h *Handlers) PostPlannerInviteHandler(w http.ResponseWriter, r *http.Request, handle string) {
	ctx := r.Context()
	metrics := inviteMetrics(ctx)
	defer metrics.Finish()

	_, owner, ok := h.plannerCreatorOnly(w, r, handle, "planner_invite_create", metrics)
	if !ok {
		return
	}

	// An empty body is an invite on every default, which is the common case.
	var req issueInviteRequest
	if r.ContentLength > 0 && !helper.DecodeJSONOrBadRequest(w, r, metrics, &req) {
		return
	}

	now := time.Now().UTC()
	lifetime := DefaultInviteLifetime
	if req.ExpiresInHours > 0 {
		lifetime = time.Duration(req.ExpiresInHours) * time.Hour
	}
	if lifetime > planner.MaxInviteLifetime {
		metrics.Error("lifetime_too_long")
		helper.RespondEndpointError(w, r, http.StatusBadRequest,
			"An invite cannot last that long",
			"planner invite: refused a lifetime past the cap", "planner_invite_lifetime",
			"planner_invite", nil, nil)
		return
	}

	token, hash, err := planner.NewInviteToken()
	if err != nil {
		metrics.Error("token_error")
		helper.RespondEndpointServerError(w, r, "Failed to create invite",
			"planner invite: token generation failed", "planner_invite_token_failed", "planner_invite", err, nil)
		return
	}

	invite := planner.Invite{
		ID:             uuid.NewString(),
		PlannerID:      owner.Key(),
		TokenHash:      hash,
		BoundAccountID: req.BoundAccountID,
		MaxUses:        max(req.MaxUses, 1),
		ExpiresAt:      now.Add(lifetime),
		CreatedBy:      helper.AuthenticatedAccountID(r),
		CreatedAt:      now,
	}

	if err := h.invites().Issue(ctx, invite, now); err != nil {
		if errors.Is(err, plannerinvites.ErrTooManyInvites) {
			metrics.Error("too_many_invites")
			helper.RespondEndpointError(w, r, http.StatusConflict,
				"This planner already has the maximum invites outstanding",
				"planner invite: refused past the cap", "planner_invite_capped",
				"planner_invite", nil, nil)
			return
		}
		metrics.Error("store_error")
		helper.RespondEndpointServerError(w, r, "Failed to create invite",
			"planner invite: store failed", "planner_invite_store_failed", "planner_invite", err, nil)
		return
	}

	w.WriteHeader(http.StatusCreated)
	if err := helper.EncodeJSON(w, issueInviteResponse{Invite: invite.Summary(), Token: token}); err != nil {
		metrics.Error("encode_error")
		helper.RespondEndpointServerError(w, r, "Internal server error",
			"planner invite: encode failed", "planner_invite_encode_failed", "planner_invite", err, nil)
		return
	}
	metrics.Success()
}

// GetPlannerInvitesHandler handles GET /api/v1/planners/{ownerHandle}/invites —
// what is outstanding, without the tokens.
func (h *Handlers) GetPlannerInvitesHandler(w http.ResponseWriter, r *http.Request, handle string) {
	ctx := r.Context()
	metrics := inviteMetrics(ctx)
	defer metrics.Finish()

	_, owner, ok := h.plannerCreatorOnly(w, r, handle, "planner_invite_list", metrics)
	if !ok {
		return
	}

	invites, err := h.invites().Pending(ctx, owner.Key(), time.Now().UTC())
	if err != nil {
		metrics.Error("store_error")
		helper.RespondEndpointServerError(w, r, "Failed to read invites",
			"planner invites: read failed", "planner_invites_failed", "planner_invite", err, nil)
		return
	}

	summaries := make([]planner.InviteSummary, 0, len(invites))
	for _, invite := range invites {
		summaries = append(summaries, invite.Summary())
	}

	w.WriteHeader(http.StatusOK)
	if err := helper.EncodeJSON(w, listInvitesResponse{Invites: summaries}); err != nil {
		metrics.Error("encode_error")
		helper.RespondEndpointServerError(w, r, "Internal server error",
			"planner invites: encode failed", "planner_invites_encode_failed", "planner_invite", err, nil)
		return
	}
	metrics.Success()
}

// DeletePlannerInviteHandler handles
// DELETE /api/v1/planners/{ownerHandle}/invites/{inviteID}.
//
// Revoking one that is already gone answers 204: the caller asked for the link
// to stop working, and it does not work.
func (h *Handlers) DeletePlannerInviteHandler(w http.ResponseWriter, r *http.Request, handle, inviteID string) {
	metrics := inviteMetrics(r.Context())
	defer metrics.Finish()

	_, owner, ok := h.plannerCreatorOnly(w, r, handle, "planner_invite_revoke", metrics)
	if !ok {
		return
	}

	if err := h.invites().Revoke(r.Context(), owner.Key(), inviteID); err != nil {
		metrics.Error("store_error")
		helper.RespondEndpointServerError(w, r, "Failed to revoke invite",
			"planner invite revoke: failed", "planner_invite_revoke_failed", "planner_invite", err, nil)
		return
	}

	w.WriteHeader(http.StatusNoContent)
	metrics.Success()
}

// invites binds the invite store to this process's Redis handle.
func (h *Handlers) invites() *plannerinvites.Store {
	return plannerinvites.New(h.Redis)
}
