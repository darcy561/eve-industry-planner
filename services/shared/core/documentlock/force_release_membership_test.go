package documentlock

import (
	"context"
	"errors"
	"strings"
	"testing"

	"eve-industry-planner/shared/models"
	eipredis "eve-industry-planner/shared/redis"
	"eve-industry-planner/testing/redisfake"
)

// A corporation planner two accounts both work in. Its key is the planner's, so
// both members' locks land on it — which is the point of the stage, and also what
// makes the account check below the only thing left guarding force-release.
const sharedCorpRef = "corp_56_K_EzReRqQkYxj0Yuq4D9csj0Cgj1a05rVvmlcLDbd"

func sharedPlanner(t *testing.T) models.Owner {
	t.Helper()
	owner := models.CorporationOwner(sharedCorpRef)
	if owner.IsZero() {
		t.Fatalf("corporation ref %q yields no owner", sharedCorpRef)
	}
	return owner
}

// Force-release exists so a person can take their own work back from their own
// stale tab. Between two members of a planner that reasoning does not hold, and
// with the key no longer namespaced by the account the script's comparison is all
// that refuses it.
func TestForceReleaseRefusesAnotherMembersLock(t *testing.T) {
	t.Parallel()
	rdb := eipredis.NewRedis(redisfake.New(t).Client)
	ctx := context.Background()
	svc := &Service{Deps: Deps{Redis: rdb}}
	owner := sharedPlanner(t)

	if _, err := svc.Acquire(ctx, owner, "acct-ann", "sess-ann", testCollection, testDocID); err != nil {
		t.Fatalf("Ann acquires: %v", err)
	}

	_, err := svc.ForceReleaseSameAccount(ctx, owner, "acct-bo", "sess-bo", testCollection, testDocID)
	if !errors.Is(err, ErrForceReleaseNoLock) {
		t.Fatalf("err = %v, want the eviction refused", err)
	}

	rec, err := GetLock(ctx, rdb, owner, testCollection, testDocID)
	if err != nil {
		t.Fatalf("GetLock: %v", err)
	}
	if rec == nil || rec.HolderSessionID != "sess-ann" {
		t.Fatalf("holder = %+v, want Ann still holding", rec)
	}
}

// The same account's other tab is still evictable, which is the case the feature
// was written for and which must survive the key moving onto the planner.
func TestForceReleaseStillEvictsTheSameAccountsOtherTab(t *testing.T) {
	t.Parallel()
	rdb := eipredis.NewRedis(redisfake.New(t).Client)
	ctx := context.Background()
	svc := &Service{Deps: Deps{Redis: rdb}}
	owner := sharedPlanner(t)

	if _, err := svc.Acquire(ctx, owner, "acct-ann", "sess-ann-tab1", testCollection, testDocID); err != nil {
		t.Fatalf("first tab acquires: %v", err)
	}

	out, err := svc.ForceReleaseSameAccount(ctx, owner, "acct-ann", "sess-ann-tab2", testCollection, testDocID)
	if err != nil {
		t.Fatalf("second tab force-releases: %v", err)
	}
	if out == nil {
		t.Fatal("force-release returned no result")
	}

	rec, err := GetLock(ctx, rdb, owner, testCollection, testDocID)
	if err != nil {
		t.Fatalf("GetLock: %v", err)
	}
	if rec == nil || rec.HolderSessionID != "sess-ann-tab2" {
		t.Fatalf("holder = %+v, want the evicting tab", rec)
	}
}

// Two members of one planner contend for a single lock on one job — the stage's
// headline. Before this, each took a key namespaced by their own account and both
// were granted.
func TestTwoMembersContendForOneLock(t *testing.T) {
	t.Parallel()
	rdb := eipredis.NewRedis(redisfake.New(t).Client)
	ctx := context.Background()
	svc := &Service{Deps: Deps{Redis: rdb}}
	owner := sharedPlanner(t)

	first, err := svc.Acquire(ctx, owner, "acct-ann", "sess-ann", testCollection, testDocID)
	if err != nil {
		t.Fatalf("Ann acquires: %v", err)
	}
	if acquired, _ := first.Payload["acquired"].(bool); !acquired {
		t.Fatalf("Ann did not get the lock: %+v", first.Payload)
	}

	second, err := svc.Acquire(ctx, owner, "acct-bo", "sess-bo", testCollection, testDocID)
	if err != nil {
		t.Fatalf("Bo acquires: %v", err)
	}
	if acquired, _ := second.Payload["acquired"].(bool); acquired {
		t.Fatal("both members hold the lock, so it is not a lock")
	}
	if holder, _ := second.Payload["holderSessionID"].(string); holder != "sess-ann" {
		t.Errorf("Bo was told the holder is %q, want sess-ann", holder)
	}
}

// A personal planner's keys are what they have always been. Rendering the owner
// key would move every live lock, waitlist entry and viewer row onto a key the
// readers miss, and a solo lease lives 24 hours.
func TestPersonalPlannerKeysAreUnprefixed(t *testing.T) {
	t.Parallel()

	owner := models.AccountOwner(testAccountID)
	for name, got := range map[string]string{
		"lock":     LockKey(owner, testCollection, testDocID),
		"waitlist": waitlistKey(owner, testCollection, testDocID),
		"pulse":    WaitlistPulseKey(owner, testCollection, testDocID, "sess-1"),
		"viewers":  ViewerPresenceKey(owner, testCollection, testDocID),
	} {
		if strings.Contains(got, "account:") {
			t.Errorf("%s key = %q, want the bare account id", name, got)
		}
		if !strings.Contains(got, testAccountID) {
			t.Errorf("%s key = %q, want it to name the account", name, got)
		}
	}
}

// A shared planner's keys carry the kind, because they have no earlier shape to
// keep and a corporation ref has to be told apart from an account id.
func TestSharedPlannerKeysCarryTheirKind(t *testing.T) {
	t.Parallel()

	owner := sharedPlanner(t)
	key := LockKey(owner, testCollection, testDocID)
	if !strings.Contains(key, "corporation:") {
		t.Fatalf("lock key = %q, want it to name the kind", key)
	}

	parsed, collection, docID, ok := ParseExpiredLockKey(key)
	if !ok || parsed != owner || collection != testCollection || docID != testDocID {
		t.Fatalf("parsed (%+v, %q, %q, %v), want the key's own parts", parsed, collection, docID, ok)
	}
}

// An expiring key written before planners existed names an account, and the
// promotion path has to read it as one rather than drop the lock on the floor.
func TestExpiredKeyWithoutAKindReadsAsAnAccount(t *testing.T) {
	t.Parallel()

	owner, collection, docID, ok := ParseExpiredLockKey(
		LockKey(models.AccountOwner(testAccountID), testCollection, testDocID))
	if !ok {
		t.Fatal("a personal planner's key did not parse")
	}
	if owner != models.AccountOwner(testAccountID) {
		t.Errorf("owner = %+v, want the account", owner)
	}
	if collection != testCollection || docID != testDocID {
		t.Errorf("got (%q, %q), want (%q, %q)", collection, docID, testCollection, testDocID)
	}
}
