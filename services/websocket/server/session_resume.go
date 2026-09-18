package server

import (
	"context"
	"eve-industry-planner/shared/jsoncodec"
	"fmt"
	"time"

	"eve-industry-planner/shared/logs"
	"eve-industry-planner/websocket/server/config"

	eipredis "eve-industry-planner/shared/redis"
)

const redisHandoffKeyPrefix = "ws:session_handoff:v2"

type sessionHandoffEntry struct {
	AccountID string
	Docs      map[string]struct{}
	Expires   time.Time
}

type redisSessionHandoffPayload struct {
	AccountID string   `json:"account_id"`
	Docs      []string `json:"docs"`
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
	ent := &sessionHandoffEntry{
		AccountID: client.AccountID,
		Docs:      docs,
		Expires:   time.Now().Add(config.SessionHandoffTTL),
	}
	s.sessionHandoffsMu.Lock()
	if s.sessionHandoffs == nil {
		s.sessionHandoffs = make(map[string]*sessionHandoffEntry)
	}
	s.sessionHandoffs[client.id] = ent
	s.sessionHandoffsMu.Unlock()

	s.storeRedisSessionHandoff(ctx, client.AccountID, client.id, docList)

	logs.DebugCtx(ctx, "session handoff snapshot for reconnect resume",
		"old_client_id", client.id,
		"account_id", client.AccountID,
		"doc_count", len(docs))
}

func (s *Server) storeRedisSessionHandoff(ctx context.Context, accountID, oldClientID string, docList []string) {
	if s.Stack == nil || s.Stack.Redis.Driver() == nil {
		return
	}
	payload := redisSessionHandoffPayload{
		AccountID: accountID,
		Docs:      docList,
	}
	b, err := jsoncodec.Marshal(payload)
	if err != nil {
		logs.WarnCtx(ctx, "session handoff redis marshal failed", "error", err)
		return
	}
	rctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	key := sessionHandoffRedisKey(accountID, oldClientID)
	err = s.Stack.Redis.Driver().Set(rctx, key, b, config.SessionHandoffTTL).Err()
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

	if s.Stack != nil && s.Stack.Redis.Driver() != nil {
		key := sessionHandoffRedisKey(accountID, previousClientID)
		rctx, cancel := context.WithTimeout(ctx, 2*time.Second)
		defer cancel()
		val, err := s.Stack.Redis.Driver().GetDel(rctx, key).Result()
		if err == nil && val != "" {
			var payload redisSessionHandoffPayload
			if errUnmarshal := jsoncodec.Unmarshal([]byte(val), &payload); errUnmarshal != nil {
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
					AccountID: accountID,
					Docs:      docs,
					Expires:   time.Now().Add(config.SessionHandoffTTL),
				}
			}
		} else if err != nil && !eipredis.IsNotFound(err) {
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
	PreviousClientID   string
	HandoffApplied     bool
	Position           uint64
	SkipDocumentLoad   bool
	RestoredDocIDs     []string
	UnauthorizedDocIDs []string
}

// ApplySessionResume moves NATS/outgoing subscription state from a disconnected client to this
// connection when the browser reconnects with the same session (same tab).
//
// position is how far the browser had applied when it dropped. Whether it may
// keep what it holds is answered from that and the stream, rather than asserted:
// the handoff says the subscriptions moved across, not that nothing happened in
// the gap.
func (s *Server) ApplySessionResume(ctx context.Context, client *Client, previousClientID string, position uint64) SessionResumeResult {
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
		if !s.docSubscribeAuthorized(docID, client) {
			res.UnauthorizedDocIDs = append(res.UnauthorizedDocIDs, docID)
			continue
		}
		s.handleSubscribeRequest(client.id, docID)
		res.RestoredDocIDs = append(res.RestoredDocIDs, docID)
	}

	missed, err := resumeMissedChanges(ctx, position, s.resumeTenants(client), s.streamLastSequence())
	if err != nil {
		logs.WarnCtx(ctx, "session resume could not read the stream; answering that a load is owed",
			"client_id", client.id, "error", err)
	}
	res.Position = position
	res.SkipDocumentLoad = !missed
	return res
}

func (s *Server) queueResumeAck(client *Client, skipDocumentLoad bool, restoredDocIDs []string) bool {
	if client == nil || client.Send == nil {
		return false
	}
	msg := map[string]any{
		"type":             "resume_ack",
		"skipDocumentLoad": skipDocumentLoad,
	}
	if len(restoredDocIDs) > 0 {
		msg["restoredDocIDs"] = restoredDocIDs
	}
	b, err := jsoncodec.Marshal(msg)
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
