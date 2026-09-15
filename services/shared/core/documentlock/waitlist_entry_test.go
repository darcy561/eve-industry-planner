package documentlock

import (
	"context"
	"testing"
	"time"

	eipredis "eve-industry-planner/shared/redis"
	"eve-industry-planner/testing/redisfake"
)

func TestWaitlistEntryRoundTrips(t *testing.T) {
	t.Parallel()

	session, account, ok := parseWaitlistEntry(waitlistEntry("sess-1", "acct-1"))
	if !ok || session != "sess-1" || account != "acct-1" {
		t.Fatalf("parsed (%q, %q, %v), want sess-1/acct-1/true", session, account, ok)
	}
}

// An entry naming no account is reported unusable rather than read as a bare
// session: promoting one would write a record force-release cannot judge.
func TestWaitlistEntryRefusesWhatNamesNoAccount(t *testing.T) {
	t.Parallel()

	for _, entry := range []string{"sess-1", "", KeyPartSep + "acct-1", "sess-1" + KeyPartSep} {
		if _, _, ok := parseWaitlistEntry(entry); ok {
			t.Errorf("parseWaitlistEntry(%q) accepted an entry naming no account", entry)
		}
	}
}

// The gap the scripts had: a session that reached the queue through RequestAccess
// rather than through Go, then was promoted when the holder's lock expired. Its
// own account has to land on the record, not the account that happened to be the
// scope.
func TestPromotedHolderCarriesTheAccountThatQueued(t *testing.T) {
	t.Parallel()
	rdb := eipredis.NewRedis(redisfake.New(t).Client)
	ctx := context.Background()
	svc := &Service{Deps: Deps{Redis: rdb}}

	now := time.Now().Unix()
	seed := LockRecord{HolderSessionID: "sess-holder", AccountID: testAccountID, ExpiresAtUnix: now + 300}
	if err := SetLock(ctx, rdb, testOwner, testCollection, testDocID, seed); err != nil {
		t.Fatalf("SetLock seed: %v", err)
	}

	// Queued by the script, which is the path that pushed a bare session id.
	if _, err := svc.RequestAccess(ctx, testOwner, testAccountID, "sess-waiter", testCollection, testDocID); err != nil {
		t.Fatalf("RequestAccess: %v", err)
	}

	head, rec, promoted, err := PromoteWaitlistHead(ctx, rdb, testOwner, testCollection, testDocID)
	if err != nil {
		t.Fatalf("PromoteWaitlistHead: %v", err)
	}
	if !promoted {
		t.Fatal("the queued session was not promoted, so its entry was unusable")
	}
	if head != "sess-waiter" {
		t.Errorf("promoted %q, want sess-waiter", head)
	}
	if rec.AccountID != testAccountID {
		t.Errorf("record account = %q, want the account that queued", rec.AccountID)
	}
}

// An entry written before the account rode along names no holder, so it is
// dropped as a stale one is rather than promoted.
func TestPromotionSkipsAnEntryNamingNoAccount(t *testing.T) {
	t.Parallel()
	rdb := eipredis.NewRedis(redisfake.New(t).Client)
	ctx := context.Background()

	now := time.Now().Unix()
	seed := LockRecord{HolderSessionID: "sess-holder", AccountID: testAccountID, ExpiresAtUnix: now + 300}
	if err := SetLock(ctx, rdb, testOwner, testCollection, testDocID, seed); err != nil {
		t.Fatalf("SetLock seed: %v", err)
	}
	k := waitlistKey(testOwner, testCollection, testDocID)
	if err := rdb.AppendToList(ctx, k, "sess-legacy", WaitlistPulseTTL); err != nil {
		t.Fatalf("seed a legacy entry: %v", err)
	}
	if err := TouchWaitlistPulse(ctx, rdb, testOwner, testCollection, testDocID, "sess-legacy"); err != nil {
		t.Fatalf("TouchWaitlistPulse: %v", err)
	}

	_, _, promoted, err := PromoteWaitlistHead(ctx, rdb, testOwner, testCollection, testDocID)
	if err != nil {
		t.Fatalf("PromoteWaitlistHead: %v", err)
	}
	if promoted {
		t.Fatal("an entry naming no account was promoted")
	}
	if n, _ := WaitlistLen(ctx, rdb, testOwner, testCollection, testDocID); n != 0 {
		t.Errorf("waitlist still holds %d entries, want the unusable one dropped", n)
	}
}
