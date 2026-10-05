package documentlock

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"eve-industry-planner/testing/natsfake"
	"eve-industry-planner/testing/redisfake"

	eipredis "eve-industry-planner/shared/redis"
)

const sessionMarker = "SECRET"

func assertNoSession(t *testing.T, where string, payload map[string]any) {
	t.Helper()
	visible := make(map[string]any, len(payload))
	for key, value := range payload {
		if key != LockSourceSessionKey {
			visible[key] = value
		}
	}
	raw, err := json.Marshal(visible)
	if err != nil {
		t.Fatalf("%s: encode: %v", where, err)
	}
	if strings.Contains(string(raw), sessionMarker) {
		t.Errorf("%s carries a session id: %s", where, raw)
	}
}

func TestNoSessionIDLeavesTheLockThroughAWholeLifecycle(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	fake := natsfake.New(t)
	if _, err := fake.NATS.DocUpdate.Ensure(ctx); err != nil {
		t.Fatalf("ensure stream: %v", err)
	}
	published, err := fake.Conn().SubscribeSync("doc.lock.>")
	if err != nil {
		t.Fatalf("subscribe: %v", err)
	}
	rdb := eipredis.NewRedis(redisfake.New(t).Client)
	deps := Deps{Redis: rdb, NATS: fake.NATS}
	svc := NewService(deps)

	const holder, waiter = "sess-" + sessionMarker + "-holder", "sess-" + sessionMarker + "-waiter"
	const collection, docID = "job_documents", "job-1"

	granted, err := svc.Acquire(ctx, testOwner, testAccountID, holder, collection, docID)
	if err != nil {
		t.Fatalf("acquire: %v", err)
	}
	assertNoSession(t, "acquire response", granted.Payload)

	HandleViewerArrivedIngress(ctx, deps, testOwner, waiter, collection, docID)
	contended, err := svc.Acquire(ctx, testOwner, "acct-2", waiter, collection, docID)
	if err != nil {
		t.Fatalf("contended acquire: %v", err)
	}
	assertNoSession(t, "contended acquire response", contended.Payload)

	requested, err := svc.RequestAccess(ctx, testOwner, "acct-2", waiter, collection, docID)
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	assertNoSession(t, "request response", requested.Payload)

	for range 4 {
		if _, err := svc.Extend(ctx, testOwner, holder, collection, docID); err != nil {
			t.Fatalf("extend: %v", err)
		}
	}
	handed, err := svc.HandOver(ctx, testOwner, holder, collection, docID)
	if err != nil {
		t.Fatalf("hand over: %v", err)
	}
	assertNoSession(t, "hand-over response", handed.Payload)

	if err := svc.Release(ctx, testOwner, waiter, collection, docID); err != nil {
		t.Fatalf("release: %v", err)
	}
	HandleViewerDepartedIngress(ctx, deps, testOwner, waiter, collection, docID)

	const otherTab = "sess-" + sessionMarker + "-other-tab"
	if _, err := svc.Acquire(ctx, testOwner, testAccountID, holder, collection, docID); err != nil {
		t.Fatalf("acquire again: %v", err)
	}
	taken, err := svc.ForceReleaseSameAccount(ctx, testOwner, testAccountID, otherTab, collection, docID)
	if err != nil {
		t.Fatalf("force release: %v", err)
	}
	assertNoSession(t, "force-release response", taken.Payload)
	if err := fake.Conn().Flush(); err != nil {
		t.Fatalf("flush: %v", err)
	}

	events := map[string]bool{}
	for {
		msg, err := published.NextMsg(200 * time.Millisecond)
		if err != nil {
			break
		}
		var payload map[string]any
		if err := json.Unmarshal(msg.Data, &payload); err != nil {
			t.Fatalf("decode event: %v", err)
		}
		event, _ := payload[LockPayloadEventKey].(string)
		events[event] = true
		assertNoSession(t, event, payload)
	}
	for _, want := range []string{
		LockEventAcquired, LockViewerEventJoined, LockEventRequested,
		LockEventHandoffCompleted, LockEventReleased, LockViewerEventLeft,
	} {
		if !events[want] {
			t.Errorf("the lifecycle published no %s, so it went unchecked (saw %v)", want, events)
		}
	}
}
