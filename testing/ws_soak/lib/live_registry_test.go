package soaklib

import (
	"context"
	"testing"
	"time"
)

func TestLiveRegistryReadySettle(t *testing.T) {
	reg := newLiveRegistry(30 * time.Millisecond)
	id := clientIdentity{AccountID: "a1", CorpID: 10, AllianceID: 99}
	reg.MarkLive(id)
	if reg.IsLive("a1") && !reg.IsReady("a1") {
		// ok
	} else {
		t.Fatalf("want live not ready: live=%v ready=%v", reg.IsLive("a1"), reg.IsReady("a1"))
	}
	reg.ScheduleReady("a1")
	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		if reg.IsReady("a1") {
			break
		}
		time.Sleep(5 * time.Millisecond)
	}
	if !reg.IsReady("a1") {
		t.Fatal("expected ready after settle")
	}
	if got := reg.ReadyCorpMembers(10); len(got) != 1 || got[0] != "a1" {
		t.Fatalf("corp members=%v", got)
	}
	if got := reg.ReadyAllianceMembers(99); len(got) != 1 {
		t.Fatalf("alliance members=%v", got)
	}
	reg.Unregister("a1")
	if reg.IsLive("a1") || reg.IsReady("a1") {
		t.Fatal("expected unregistered")
	}
}

func TestResolveJobExpectsFiltersOffline(t *testing.T) {
	reg := newLiveRegistry(time.Millisecond)
	solo := clientIdentity{AccountID: "solo-1"}
	m1 := clientIdentity{AccountID: "m1", CorpID: 20, AllianceID: 30}
	m2 := clientIdentity{AccountID: "m2", CorpID: 20, AllianceID: 30}
	settling := clientIdentity{AccountID: "m3", CorpID: 20, AllianceID: 30}
	for _, id := range []clientIdentity{solo, m1, m2} {
		reg.MarkLive(id)
		reg.ScheduleReady(id.AccountID)
	}
	reg.MarkLive(settling) // live, not ready — excluded (FilterSubjects widen gap accepted)
	waitReady(context.Background(), reg, 3, time.Second)

	acct := fanoutJob{Kind: fanoutMsgAccount, AccountID: "solo-1"}
	if got := resolveJobExpects(reg, acct); len(got) != 1 || got[0] != "solo-1" {
		t.Fatalf("account=%v", got)
	}
	if got := resolveJobExpects(reg, fanoutJob{Kind: fanoutMsgAccount, AccountID: "gone"}); len(got) != 0 {
		t.Fatalf("offline account should skip: %v", got)
	}

	corp := fanoutJob{Kind: fanoutMsgCorpFull, CorpID: 20}
	got := resolveJobExpects(reg, corp)
	if len(got) != 2 {
		t.Fatalf("corp ready=%v want 2 (excludes settling m3)", got)
	}

	down := fanoutJob{
		Kind:            fanoutMsgCorpDownAccount,
		ScopeAccountIDs: []string{"m1", "m3", "gone"},
	}
	got = resolveJobExpects(reg, down)
	if len(got) != 1 || got[0] != "m1" {
		t.Fatalf("corp down=%v want m1 only", got)
	}

	all := fanoutJob{Kind: fanoutMsgAllianceFull, AllianceID: 30}
	if got := resolveJobExpects(reg, all); len(got) != 2 {
		t.Fatalf("alliance=%v want 2", got)
	}
}

func TestLiveRegistrySnapshot(t *testing.T) {
	reg := newLiveRegistry(time.Millisecond)
	reg.MarkLive(clientIdentity{AccountID: "s1"})
	reg.MarkLive(clientIdentity{AccountID: "c1", CorpID: 1, AllianceID: 2})
	reg.ScheduleReady("s1")
	reg.ScheduleReady("c1")
	waitReady(context.Background(), reg, 2, time.Second)
	snap := reg.Snapshot()
	if snap.ReadyCount != 2 || snap.LiveCount != 2 || len(snap.ReadySolos) != 1 {
		t.Fatalf("snap=%+v", snap)
	}
	if len(snap.ReadyByCorp[1]) != 1 || len(snap.ReadyByAll[2]) != 1 {
		t.Fatalf("by org=%v %v", snap.ReadyByCorp, snap.ReadyByAll)
	}
}
