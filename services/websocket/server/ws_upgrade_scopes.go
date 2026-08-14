package server

import (
	"context"
	"encoding/json"
	"strings"

	"eve-industry-planner/shared/logs"
)

func (s *Server) handleUpgradeScopesWS(ctx context.Context, client *Client, msg []byte) {
	var upgrade struct {
		CorporationIDs []string `json:"corporationIDs"`
		AllianceIDs    []string `json:"allianceIDs"`
	}
	if err := json.Unmarshal(msg, &upgrade); err != nil {
		finishWSOperationFailure(ctx, client, "upgrade_scopes",
			"websocket upgrade scopes: invalid message",
			"ws_upgrade_scopes_invalid_message", map[string]any{
				"error": err.Error(),
			})
		return
	}

	wsAppendDebugStep(ctx, "upgrade_scopes_request", map[string]any{
		"requested_corporation_count": len(upgrade.CorporationIDs),
		"requested_alliance_count":    len(upgrade.AllianceIDs),
	})

	applied := s.ApplyRealtimeScopeUpgrade(client, upgrade.CorporationIDs, upgrade.AllianceIDs)
	extra := map[string]any{
		"scopes_applied":            applied,
		"active_corporation_scopes": len(client.Scopes.CorporationIDs),
		"active_alliance_scopes":    len(client.Scopes.AllianceIDs),
	}
	if applied {
		if len(client.Scopes.CorporationIDs) > 0 {
			extra["corporation_ids"] = strings.Join(client.Scopes.CorporationIDs, ",")
		}
		if len(client.Scopes.AllianceIDs) > 0 {
			extra["alliance_ids"] = strings.Join(client.Scopes.AllianceIDs, ",")
		}
	}

	if !applied {
		finishWSOperationSuccess(ctx, client, "upgrade_scopes",
			"websocket upgrade scopes (no valid scopes)", extra, "debug")
		return
	}

	ackDelivered := s.queueScopesAck(client)
	extra["ack_delivered"] = ackDelivered
	if !ackDelivered {
		logs.AttachHandlerCaveatCtx(ctx, "upgrade_scopes_ack_buffer_full",
			"scopes_ack not delivered", map[string]any{
				"client_id": client.id,
			})
	}

	successLevel := "info"
	if !ackDelivered {
		successLevel = ""
	}
	finishWSOperationSuccess(ctx, client, "upgrade_scopes", "websocket upgrade scopes", extra, successLevel)
}
