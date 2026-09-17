package server

import (
	"context"
	"encoding/json"

	"eve-industry-planner/shared/models"
)

// activePlannerMessage names the planner a connection is working in.
//
// One owner key, and the client names nothing else: not a collection set, which
// follows from the owner's kind, and not the account's own documents, which stay
// live whichever planner is active.
type activePlannerMessage struct {
	Type   string `json:"type"`
	Owner  string `json:"owner"`
	Client string `json:"clientID,omitempty"`
}

// handleActivePlannerWS switches which planner a connection receives changes for.
//
// **The subscription is replaced, not widened.** Switching has to stop the
// previous planner, which is the whole reason the message the client used to send
// was removed: a merge can only ever add scopes, so nothing could stop receiving
// one short of reconnecting.
//
// The account's own key survives the switch. It carries the account's settings and
// watchlist, which stay live wherever the account is working, and dropping it
// would silence those for the length of a visit to somebody else's planner.
//
// The ceiling is what the session was granted at connect. A client naming an owner
// outside it is refused rather than narrowed to nothing, because the two are
// different mistakes and only one of them is the client's.
func (s *Server) handleActivePlannerWS(ctx context.Context, client *Client, msg []byte) {
	const op = "active_planner"

	var parsed activePlannerMessage
	if err := json.Unmarshal(msg, &parsed); err != nil {
		finishWSOperationFailure(ctx, client, op,
			"websocket active planner: invalid message",
			"ws_active_planner_invalid_message", map[string]any{"error": err.Error()})
		return
	}

	owner, err := models.ParseOwnerHandle(parsed.Owner, s.entityCipher)
	if err != nil {
		finishWSOperationFailure(ctx, client, op,
			"websocket active planner: unreadable owner",
			"ws_active_planner_bad_owner", map[string]any{"error": err.Error()})
		return
	}

	ceiling := s.clientScopeCeiling(client)
	if !ceiling.Has(owner) {
		finishWSOperationFailure(ctx, client, op,
			"websocket active planner: owner outside the session's grants",
			"ws_active_planner_not_granted", map[string]any{
				"owner_kind": string(owner.Kind),
			})
		return
	}

	next := activeScopes(client.AccountID, owner)
	s.setClientScopes(client, next)

	wsAppendDebugStep(ctx, "active_planner_set", map[string]any{
		"owner_kind":  string(owner.Kind),
		"scope_count": len(next),
	})
	finishWSOperationSuccess(ctx, client, op, "websocket active planner set",
		map[string]any{
			"owner_kind":  string(owner.Kind),
			"scope_count": len(next),
		}, "info")
}

// activeScopes is what a connection receives while one planner is active: that
// planner, and the account's own documents.
//
// When the active planner is the account's own the two are one key, which
// Normalized collapses — the same answer without a case of its own.
func activeScopes(accountID string, active models.Owner) models.OwnerKeys {
	return models.NewOwnerKeys().
		Add(models.AccountOwner(accountID)).
		Add(active).
		Normalized()
}

// clientScopeCeiling is every owner the session may reach, which is what it was
// granted at connect.
//
// Read from the connection rather than from Mongo: a membership removed since
// connect is refused by the endpoints that write, and re-reading here would make
// a switch cost a database round trip on a message that is meant to be cheap.
func (s *Server) clientScopeCeiling(client *Client) models.OwnerKeys {
	if client == nil {
		return nil
	}
	if client.Ceiling != nil {
		return client.Ceiling
	}
	return client.Scopes
}
