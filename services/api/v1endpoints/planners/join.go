package planners

import (
	"errors"
	"net/http"
	"time"

	"eve-industry-planner/api/helper"
	"eve-industry-planner/shared/core/sessiongrants"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/models"
	"eve-industry-planner/shared/models/planner"
	eipmongo "eve-industry-planner/shared/mongo"
)

// joinRequest is a redemption: the invite being spent and the token proving the
// caller was given it.
type joinRequest struct {
	InviteID string `json:"inviteID"`
	Token    string `json:"token"`
}

// joinResponse names the planner that was joined, as a handle.
type joinResponse struct {
	Owner  string `json:"owner"`
	Name   string `json:"name"`
	Joined bool   `json:"joined"`
}

// PostPlannerJoinHandler handles POST /api/v1/planners/join.
//
// It is the one planner route not under an owner handle: the caller holds no
// membership row yet, so the guard every other route runs would refuse them.
// The invite names the planner instead, and holding the token is what admits.
func (h *Handlers) PostPlannerJoinHandler(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	metrics := inviteMetrics(ctx)
	defer metrics.Finish()

	accountID := helper.AuthenticatedAccountID(r)
	if accountID == "" {
		metrics.Error("unauthenticated")
		helper.RespondEndpointError(w, r, http.StatusUnauthorized, "Authentication required",
			"planner join: no account on the request", "planner_join_unauthenticated",
			"planner_join", nil, nil)
		return
	}

	var req joinRequest
	if !helper.DecodeJSONOrBadRequest(w, r, metrics, &req) {
		return
	}
	if req.InviteID == "" || req.Token == "" {
		metrics.Error("bad_request")
		helper.RespondEndpointError(w, r, http.StatusBadRequest,
			"An invite and its token are required",
			"planner join: incomplete redemption", "planner_join_incomplete",
			"planner_join", nil, nil)
		return
	}

	now := time.Now().UTC()
	invite, err := h.invites().Spend(ctx, req.InviteID, req.Token, accountID, now)
	if err != nil {
		respondInviteRefused(w, r, metrics, err)
		return
	}

	owner, err := models.ParseOwnerKey(invite.PlannerID)
	if err != nil {
		metrics.Error("unreadable_planner")
		helper.RespondEndpointServerError(w, r, "Failed to join planner",
			"planner join: invite names an unreadable planner", "planner_join_bad_planner",
			"planner_join", err, nil)
		return
	}

	joined, err := h.Mongo.JoinPlannerByInvite(ctx, owner, accountID, planner.InviteRedemption{
		InvitedBy: invite.CreatedBy,
		IssuedAt:  invite.CreatedAt,
		InviteID:  invite.ID,
	}, now)

	// Already a member is an outcome rather than a failure: the caller presented
	// a valid invite and is in the planner it names. A use was spent reaching
	// here, which is what stops a token being probed for free.
	alreadyIn := errors.Is(err, eipmongo.ErrAlreadyAMember)
	switch {
	case errors.Is(err, eipmongo.ErrKindAdmitsNoInvite):
		// The invite names a planner whose roster is not decided by invites, so
		// it is refused the same way a stranger's is rather than explained.
		metrics.Error("kind_admits_no_invite")
		helper.RespondEndpointError(w, r, http.StatusNotFound, "Not found",
			"planner join: the invite names a planner that takes none",
			"planner_join_wrong_kind", "planner_join", nil, nil)
		return
	case errors.Is(err, eipmongo.ErrNoSuchPlanner):
		metrics.Error("no_such_planner")
		helper.RespondEndpointError(w, r, http.StatusGone,
			"The planner this invite was for no longer exists",
			"planner join: the invite names no planner", "planner_join_no_planner",
			"planner_join", nil, nil)
		return
	case errors.Is(err, eipmongo.ErrPlannerFull):
		metrics.Error("planner_full")
		helper.RespondEndpointError(w, r, http.StatusConflict,
			"This planner is full",
			"planner join: refused a full planner", "planner_join_full",
			"planner_join", nil, nil)
		return
	case err != nil && !alreadyIn:
		metrics.Error("database_error")
		helper.RespondEndpointServerError(w, r, "Failed to join planner",
			"planner join: write failed", "planner_join_write_failed", "planner_join", err, nil)
		return
	}

	// A membership row is what grants are derived from, so a join that stopped
	// here would leave the account's stored ceiling without the planner it has
	// just joined — and the ceiling is what every scoped surface reads, including
	// the connection already open. Not fatal to the join: the row is written and
	// the next derivation repairs it, so the member is in the planner either way.
	if !alreadyIn {
		if grantsErr := sessiongrants.WriteFromMemberships(ctx, h.Mongo, h.Redis, h.NATS, accountID); grantsErr != nil {
			logs.AttachHandlerCaveat(r, "planner_join_grants_not_written",
				"planner join: grants not rewritten", map[string]any{
					"account_id": accountID,
					"error":      grantsErr.Error(),
				})
		}
	}

	handle, err := models.OwnerHandle(owner, h.EntityCipher)
	if err != nil {
		metrics.Error("owner_handle_failed")
		helper.RespondEndpointServerError(w, r, "Failed to join planner",
			"planner join: owner handle failed", "planner_join_handle_failed", "planner_join", err, nil)
		return
	}

	status := http.StatusCreated
	if alreadyIn {
		status = http.StatusOK
	}
	w.WriteHeader(status)
	if err := helper.EncodeJSON(w, joinResponse{
		Owner: handle, Name: joined.Name, Joined: !alreadyIn,
	}); err != nil {
		metrics.Error("encode_error")
		helper.RespondEndpointServerError(w, r, "Internal server error",
			"planner join: encode failed", "planner_join_encode_failed", "planner_join", err, nil)
		return
	}
	metrics.Success()
}

// respondInviteRefused turns a redemption failure into a status.
//
// Every refusal answers 404 apart from a full or expired one, so a caller
// holding an id and guessing tokens cannot tell a wrong token from an invite
// that does not exist.
func respondInviteRefused(w http.ResponseWriter, r *http.Request, metrics *helper.RequestMetricsTracker, err error) {
	switch {
	case errors.Is(err, planner.ErrInviteExpired):
		metrics.Error("invite_expired")
		helper.RespondEndpointError(w, r, http.StatusGone, "This invite has expired",
			"planner join: expired invite", "planner_join_expired", "planner_join", nil, nil)
	case errors.Is(err, planner.ErrInviteSpent):
		metrics.Error("invite_spent")
		helper.RespondEndpointError(w, r, http.StatusGone, "This invite has already been used",
			"planner join: spent invite", "planner_join_spent", "planner_join", nil, nil)
	case errors.Is(err, planner.ErrInviteNotFound),
		errors.Is(err, planner.ErrInviteToken),
		errors.Is(err, planner.ErrInviteRevoked),
		errors.Is(err, planner.ErrInviteBound):
		metrics.Error("invite_refused")
		helper.RespondEndpointError(w, r, http.StatusNotFound, "Not found",
			"planner join: refused an invite", "planner_join_refused", "planner_join", nil, nil)
	default:
		metrics.Error("store_error")
		helper.RespondEndpointServerError(w, r, "Failed to join planner",
			"planner join: redemption failed", "planner_join_failed", "planner_join", err, nil)
	}
}
