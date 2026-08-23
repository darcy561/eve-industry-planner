package server

import (
	"context"
	"fmt"
	"testing"
	"time"

	"eve-industry-planner/shared/core/documentlock"
	"eve-industry-planner/testing/wait"
	"eve-industry-planner/websocket/server/doclocklogic"
)

func TestIntegrationDocLockWaitlistPulseSetsRedis(t *testing.T) {
	f := newIntegFixture(t)
	const (
		accountID  = "acct-doclock-pulse"
		sessionID  = "sess-doclock-pulse"
		collection = "jobs"
		docID      = "job-1"
	)
	conn := f.connectAccount(accountID, sessionID)
	pulseKey := documentlock.WaitlistPulseKey(accountID, collection, docID, sessionID)

	f.writeJSON(conn, map[string]any{
		"type":       doclocklogic.MsgWaitlistPulse,
		"collection": collection,
		// missing docID → invalid; must not set pulse
	})
	time.Sleep(50 * time.Millisecond)
	f.requireRedisAbsent(pulseKey)

	f.writeJSON(conn, map[string]any{
		"type":       doclocklogic.MsgWaitlistPulse,
		"collection": collection,
		"docID":      docID,
	})
	f.waitRedisExists(pulseKey, 2*time.Second)
	f.requireRedisValue(pulseKey, "1")
}

func TestIntegrationDocLockViewerArrivedAndDeparted(t *testing.T) {
	f := newIntegFixture(t)
	const (
		accountID  = "acct-doclock-viewer"
		sessionID  = "sess-doclock-viewer"
		collection = "jobs"
		docID      = "job-v1"
	)
	conn := f.connectAccount(accountID, sessionID)
	viewersKey := documentlock.ViewerPresenceKey(accountID, collection, docID)

	f.writeJSON(conn, map[string]any{
		"type":       doclocklogic.MsgViewerArrived,
		"collection": collection,
		"docID":      docID,
	})
	wait.For(t, 2*time.Second, func() (bool, string) {
		n, err := f.Redis.ZScore(context.Background(), viewersKey, sessionID).Result()
		return err == nil && n > 0, fmt.Sprintf("viewer not in set: score=%v err=%v", n, err)
	})

	f.writeJSON(conn, map[string]any{
		"type":       doclocklogic.MsgViewerDeparted,
		"collection": collection,
		"docID":      docID,
	})
	wait.For(t, 2*time.Second, func() (bool, string) {
		err := f.Redis.ZScore(context.Background(), viewersKey, sessionID).Err()
		return err != nil, "viewer still in set after departed"
	})
}

func TestIntegrationDocLockLockStateBatchAckOK(t *testing.T) {
	f := newIntegFixture(t)
	conn := f.connectAccount("acct-batch-ok", "sess-batch-ok")

	f.writeJSON(conn, map[string]any{
		"type":      doclocklogic.MsgLockStateBatch,
		"requestId": "req-ok-1",
		"jobDocIDs": []string{"job-a"},
	})
	ack := f.readJSONOfType(conn, doclocklogic.MsgLockStateBatchAck, 2*time.Second)
	if ok, _ := ack["ok"].(bool); !ok {
		t.Fatalf("ack=%v", ack)
	}
	if got, _ := ack["requestId"].(string); got != "req-ok-1" {
		t.Fatalf("requestId=%v", ack["requestId"])
	}
	jobs, _ := ack["jobResults"].(map[string]any)
	if jobs == nil || jobs["job-a"] == nil {
		t.Fatalf("jobResults=%v", ack["jobResults"])
	}
}

func TestIntegrationDocLockLockStateBatchAckEmpty(t *testing.T) {
	f := newIntegFixture(t)
	conn := f.connectAccount("acct-batch-empty", "sess-batch-empty")

	f.writeJSON(conn, map[string]any{
		"type":      doclocklogic.MsgLockStateBatch,
		"requestId": "req-empty",
	})
	ack := f.readJSONOfType(conn, doclocklogic.MsgLockStateBatchAck, 2*time.Second)
	if ok, _ := ack["ok"].(bool); ok {
		t.Fatalf("want ok=false ack=%v", ack)
	}
	if errMsg, _ := ack["error"].(string); errMsg != documentlock.ErrStatusBatchEmpty.Error() {
		t.Fatalf("error=%q", errMsg)
	}
}

func TestIntegrationDocLockLockStateBatchAckTooMany(t *testing.T) {
	f := newIntegFixture(t)
	conn := f.connectAccount("acct-batch-many", "sess-batch-many")

	ids := make([]string, documentlock.MaxStatusBatchDocs+1)
	for i := range ids {
		ids[i] = fmt.Sprintf("j-%d", i)
	}
	f.writeJSON(conn, map[string]any{
		"type":      doclocklogic.MsgLockStateBatch,
		"requestId": "req-many",
		"jobDocIDs": ids,
	})
	ack := f.readJSONOfType(conn, doclocklogic.MsgLockStateBatchAck, 2*time.Second)
	if ok, _ := ack["ok"].(bool); ok {
		t.Fatalf("want ok=false ack=%v", ack)
	}
	if errMsg, _ := ack["error"].(string); errMsg != documentlock.ErrStatusBatchTooMany.Error() {
		t.Fatalf("error=%q", errMsg)
	}
}

func TestIntegrationDocLockLockStateBatchMissingRequestID(t *testing.T) {
	f := newIntegFixture(t)
	conn := f.connectAccount("acct-batch-noreq", "sess-batch-noreq")

	f.writeJSON(conn, map[string]any{
		"type":      doclocklogic.MsgLockStateBatch,
		"jobDocIDs": []string{"job-a"},
	})
	// No ack without requestId — connection stays up; a later valid batch still works.
	time.Sleep(50 * time.Millisecond)
	f.writeJSON(conn, map[string]any{
		"type":      doclocklogic.MsgLockStateBatch,
		"requestId": "req-after",
		"jobDocIDs": []string{"job-a"},
	})
	ack := f.readJSONOfType(conn, doclocklogic.MsgLockStateBatchAck, 2*time.Second)
	if got, _ := ack["requestId"].(string); got != "req-after" {
		t.Fatalf("ack=%v", ack)
	}
}
