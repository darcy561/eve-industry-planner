package server

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"eve-industry-planner/shared/logs"
	"eve-industry-planner/websocket/server/config"

	redislib "github.com/redis/go-redis/v9"
)

const redisHandoffKeyPrefix = "ws:session_handoff:v1"

type sessionHandoffEntry struct {
	AccountID      string
	Docs           map[string]struct{}
	CorporationIDs []string
	AllianceIDs    []string
	Expires        time.Time
}

type redisSessionHandoffPayload struct {
	AccountID      string   `json:"account_id"`
	Docs           []string `json:"docs"`
	CorporationIDs []string `json:"corporation_ids,omitempty"`
	AllianceIDs    []string `json:"alliance_ids,omitempty"`
}

func sessionHandoffRedisKey(accountID, oldClientID string) string {
	return fmt.Sprintf("%s:%s:%s", redisHandoffKeyPrefix, accountID, oldClientID)
}

func (s *Server) snapshotSessionHandoff(ctx context.Context, client *Client) {
	if client == nil || client.id == "" || client.AccountID == "" {
		return
	}
	docs := make(map[string]struct{})
	docList := make([]string, 0)
	for docID := range client.explicitDocIDs {
		if docID != "" {
			docs[docID] = struct{}{}
			docList = append(docList, docID)
		}
	}
	corpCopy := append([]string(nil), client.Scopes.CorporationIDs...)
	allianceCopy := append([]string(nil), client.Scopes.AllianceIDs...)
	ent := &sessionHandoffEntry{
		AccountID:      client.AccountID,
		Docs:           docs,
		CorporationIDs: corpCopy,
		AllianceIDs:    allianceCopy,
		Expires:        time.Now().Add(config.SessionHandoffTTL),
	}
	s.sessionHandoffsMu.Lock()
	if s.sessionHandoffs == nil {
		s.sessionHandoffs = make(map[string]*sessionHandoffEntry)
	}
	s.sessionHandoffs[client.id] = ent
	s.sessionHandoffsMu.Unlock()

	s.storeRedisSessionHandoff(ctx, client.AccountID, client.id, docList, corpCopy, allianceCopy)

	logs.DebugCtx(ctx, "session handoff snapshot for reconnect resume",
		"old_client_id", client.id,
		"account_id", client.AccountID,
		"doc_count", len(docs),
		"corp_scopes", len(corpCopy),
		"alliance_scopes", len(allianceCopy))
}

func (s *Server) storeRedisSessionHandoff(ctx context.Context, accountID, oldClientID string, docList, corpIDs, allianceIDs []string) {
	if s.Stack == nil || s.Stack.Redis == nil {
		return
	}
	payload := redisSessionHandoffPayload{
		AccountID:      accountID,
		Docs:           docList,
		CorporationIDs: corpIDs,
		AllianceIDs:    allianceIDs,
	}
	b, err := json.Marshal(payload)
	if err != nil {
		logs.WarnCtx(ctx, "session handoff redis marshal failed", "error", err)
		return
	}
	rctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	key := sessionHandoffRedisKey(accountID, oldClientID)
	err = s.Stack.Redis.Set(rctx, key, b, config.SessionHandoffTTL).Err()
	if err != nil {
		logs.WarnCtx(ctx, "session handoff redis SET failed", "error", err, "key_prefix", redisHandoffKeyPrefix)
	}
}

func (s *Server) pruneExpiredSessionHandoffsLocked(now time.Time) {
	for id, ent := range s.sessionHandoffs {
		if ent == nil || now.After(ent.Expires) {
			delete(s.sessionHandoffs, id)
		}
	}
}

// popSessionHandoff removes handoff from Redis (cross-replica) or local memory (sticky / Redis miss).
func (s *Server) popSessionHandoff(ctx context.Context, accountID, previousClientID string) *sessionHandoffEntry {
	if accountID == "" || previousClientID == "" {
		return nil
	}

	if s.Stack != nil && s.Stack.Redis != nil {
		key := sessionHandoffRedisKey(accountID, previousClientID)
		rctx, cancel := context.WithTimeout(ctx, 2*time.Second)
		defer cancel()
		val, err := s.Stack.Redis.GetDel(rctx, key).Result()
		if err == nil && val != "" {
			var payload redisSessionHandoffPayload
			if errUnmarshal := json.Unmarshal([]byte(val), &payload); errUnmarshal != nil {
				logs.WarnCtx(ctx, "session handoff Redis payload invalid", "error", errUnmarshal)
			} else if payload.AccountID == accountID {
				docs := make(map[string]struct{})
				for _, d := range payload.Docs {
					if d != "" {
						docs[d] = struct{}{}
					}
				}
				logs.DebugCtx(ctx, "session handoff hit from Redis",
					"previous_client_id", previousClientID,
					"account_id", accountID,
					"doc_count", len(docs))
				s.sessionHandoffsMu.Lock()
				delete(s.sessionHandoffs, previousClientID)
				s.sessionHandoffsMu.Unlock()
				return &sessionHandoffEntry{
					AccountID:      accountID,
					Docs:           docs,
					CorporationIDs: append([]string(nil), payload.CorporationIDs...),
					AllianceIDs:    append([]string(nil), payload.AllianceIDs...),
					Expires:        time.Now().Add(config.SessionHandoffTTL),
				}
			}
		} else if err != nil && err != redislib.Nil {
			logs.WarnCtx(ctx, "session handoff Redis GETDEL failed", "error", err)
		}
	}

	now := time.Now()
	s.sessionHandoffsMu.Lock()
	defer s.sessionHandoffsMu.Unlock()
	s.pruneExpiredSessionHandoffsLocked(now)
	ent, ok := s.sessionHandoffs[previousClientID]
	if !ok || ent == nil || now.After(ent.Expires) {
		return nil
	}
	if ent.AccountID != accountID {
		logs.WarnCtx(ctx, "session resume rejected: account mismatch (memory handoff)",
			"previous_client_id", previousClientID,
			"account_id", accountID,
			"handoff_account_id", ent.AccountID)
		return nil
	}
	delete(s.sessionHandoffs, previousClientID)
	return ent
}

// SessionResumeResult summarizes reconnect handoff for consolidated WS logging.
type SessionResumeResult struct {
	PreviousClientID    string
	HandoffApplied      bool
	SkipBaselineSync    bool
	RestoredDocIDs      []string
	UnauthorizedDocIDs  []string
	ScopesRestored      bool
}

// ApplySessionResume moves NATS/outgoing subscription state from a disconnected client to this
// connection when the browser reconnects with the same session (same tab).
func (s *Server) ApplySessionResume(ctx context.Context, client *Client, previousClientID string) SessionResumeResult {
	res := SessionResumeResult{PreviousClientID: previousClientID}
	if client == nil || previousClientID == "" || previousClientID == client.id {
		return res
	}

	ent := s.popSessionHandoff(ctx, client.AccountID, previousClientID)
	if ent == nil {
		return res
	}
	res.HandoffApplied = true

	for docID := range ent.Docs {
		if !s.docSubscribeAuthorized(ctx, docID, client.AccountID) {
			res.UnauthorizedDocIDs = append(res.UnauthorizedDocIDs, docID)
			continue
		}
		s.handleSubscribeRequest(client.id, docID)
		res.RestoredDocIDs = append(res.RestoredDocIDs, docID)
	}

	if len(ent.CorporationIDs) > 0 || len(ent.AllianceIDs) > 0 {
		next := replaceScopesWithinSessionGrants(client, ent.CorporationIDs, ent.AllianceIDs)
		if len(next.CorporationIDs) > 0 || len(next.AllianceIDs) > 0 {
			s.swapClientOrgScopesAndIndexes(client, next)
			res.ScopesRestored = true
		}
	}

	res.SkipBaselineSync = true
	return res
}

func (s *Server) queueResumeAck(client *Client, skipBaselineSync bool, restoredDocIDs []string) bool {
	if client == nil || client.Send == nil {
		return false
	}
	msg := map[string]interface{}{
		"type":             "resume_ack",
		"skipBaselineSync": skipBaselineSync,
	}
	if len(restoredDocIDs) > 0 {
		msg["restoredDocIDs"] = restoredDocIDs
	}
	b, err := json.Marshal(msg)
	if err != nil {
		return false
	}
	select {
	case client.Send <- b:
		return true
	default:
		return false
	}
}
