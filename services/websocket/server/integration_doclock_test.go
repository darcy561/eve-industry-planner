package server

import (
	"context"
	"eve-industry-planner/shared/models"
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
	pulseKey := documentlock.WaitlistPulseKey(models.AccountOwner(accountID), collection, docID, sessionID)

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
		"owner":      models.AccountOwner(accountID).Key(),
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
	viewersKey := documentlock.ViewerPresenceKey(models.AccountOwner(accountID), collection, docID)

	f.writeJSON(conn, map[string]any{
		"type":       doclocklogic.MsgViewerArrived,
		"collection": collection,
		"docID":      docID,
		"owner":      models.AccountOwner(accountID).Key(),
	})
	wait.For(t, 2*time.Second, func() (bool, string) {
		n, err := f.Redis.Driver().ZScore(context.Background(), viewersKey, sessionID).Result()
		return err == nil && n > 0, fmt.Sprintf("viewer not in set: score=%v err=%v", n, err)
	})

	f.writeJSON(conn, map[string]any{
		"type":       doclocklogic.MsgViewerDeparted,
		"collection": collection,
		"docID":      docID,
		"owner":      models.AccountOwner(accountID).Key(),
	})
	wait.For(t, 2*time.Second, func() (bool, string) {
		err := f.Redis.Driver().ZScore(context.Background(), viewersKey, sessionID).Err()
		return err != nil, "viewer still in set after departed"
	})
}

func TestIntegrationDocLockLockStateBatchAckOK(t *testing.T) {
	f := newIntegFixture(t)
	conn := f.connectAccount("acct-batch-ok", "sess-batch-ok")

	f.writeJSON(conn, map[string]any{
		"type":      doclocklogic.MsgLockStateBatch,
		"owner":     models.AccountOwner("acct-batch-ok").Key(),
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
		"owner":     models.AccountOwner("acct-batch-empty").Key(),
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
		"owner":     models.AccountOwner("acct-batch-many").Key(),
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
		"owner":     models.AccountOwner("acct-batch-noreq").Key(),
		"jobDocIDs": []string{"job-a"},
	})
	// No ack without requestId — connection stays up; a later valid batch still works.
	time.Sleep(50 * time.Millisecond)
	f.writeJSON(conn, map[string]any{
		"type":      doclocklogic.MsgLockStateBatch,
		"owner":     models.AccountOwner("acct-batch-noreq").Key(),
		"requestId": "req-after",
		"jobDocIDs": []string{"job-a"},
	})
	ack := f.readJSONOfType(conn, doclocklogic.MsgLockStateBatchAck, 2*time.Second)
	if got, _ := ack["requestId"].(string); got != "req-after" {
		t.Fatalf("ack=%v", ack)
	}
}

// The planner a lock frame names is the planner it works in — not whatever the
// connection last recorded. Only a real socket proves it: the frame is parsed,
// the handle re-encrypted to the ref the key is built from, and the session's
// grants consulted, and no unit sees all three.
func TestIntegrationDocLockFrameWorksInThePlannerItNames(t *testing.T) {
	f := newIntegFixture(t)
	const (
		accountID  = "acct-doclock-named"
		sessionID  = "sess-doclock-named"
		collection = "jobs"
		docID      = "job-named"
	)
	f.seedSessionWithGrants(accountID, sessionID, []int64{10}, nil)
	conn, _ := f.connectTab(sessionID)
	f.waitClients(1, 2*time.Second)

	corp := models.CorporationOwner(wsTestCorpRef(t, 10))
	plannerKey := documentlock.WaitlistPulseKey(corp, collection, docID, sessionID)
	accountKey := documentlock.WaitlistPulseKey(models.AccountOwner(accountID), collection, docID, sessionID)

	// Nothing has sent active_planner, so the connection still records the
	// account's own planner. The frame naming the corporation is what decides.
	f.writeJSON(conn, map[string]any{
		"type":       doclocklogic.MsgWaitlistPulse,
		"collection": collection,
		"docID":      docID,
		"owner":      "corporation:10",
	})

	f.waitRedisExists(plannerKey, 2*time.Second)
	f.requireRedisAbsent(accountKey)
}

// A planner the session was never granted, and a frame naming none at all, are
// the same refusal: without one there is no scope to fall back to that is not a
// guess.
func TestIntegrationDocLockRefusesAPlannerTheSessionCannotReach(t *testing.T) {
	f := newIntegFixture(t)
	const (
		accountID  = "acct-doclock-refused"
		sessionID  = "sess-doclock-refused"
		collection = "jobs"
		docID      = "job-refused"
	)
	f.seedSessionWithGrants(accountID, sessionID, []int64{10}, nil)
	conn, _ := f.connectTab(sessionID)
	f.waitClients(1, 2*time.Second)

	stranger := models.CorporationOwner(wsTestCorpRef(t, 11))
	for _, owner := range []string{"corporation:11", ""} {
		f.writeJSON(conn, map[string]any{
			"type":       doclocklogic.MsgWaitlistPulse,
			"collection": collection,
			"docID":      docID,
			"owner":      owner,
		})
	}
	time.Sleep(100 * time.Millisecond)

	f.requireRedisAbsent(documentlock.WaitlistPulseKey(stranger, collection, docID, sessionID))
	f.requireRedisAbsent(documentlock.WaitlistPulseKey(models.AccountOwner(accountID), collection, docID, sessionID))
}
