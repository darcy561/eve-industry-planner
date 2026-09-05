package models

import (
	"encoding/json"
	"strings"
	"testing"
	"time"
)

// The planner's id is its owner key, so the owner is stored once rather than
// beside a copy of itself that could disagree.
func TestPlannerReadsItsOwnerFromItsID(t *testing.T) {
	t.Parallel()

	owner, err := Planner{ID: AccountOwner("acct-1").Key()}.Owner()
	if err != nil {
		t.Fatalf("Owner: %v", err)
	}
	if owner != AccountOwner("acct-1") {
		t.Fatalf("owner = %+v", owner)
	}

	if _, err := (Planner{ID: "not-a-key"}).Owner(); err == nil {
		t.Fatal("an id that is not an owner key must not read back as one")
	}
}

func TestPlannerIsSharedOnlyAboveOneMember(t *testing.T) {
	t.Parallel()

	for _, tc := range []struct {
		members int
		shared  bool
	}{{0, false}, {1, false}, {2, true}} {
		if got := (Planner{MemberCount: tc.members}).Shared(); got != tc.shared {
			t.Errorf("%d members: shared = %v, want %v", tc.members, got, tc.shared)
		}
	}
}

// The branch that is set is the method, so none set and two set are both
// meaningless — and two would let a reader pick either answer.
func TestJoinMethodWantsExactlyOneBranch(t *testing.T) {
	t.Parallel()

	if err := (JoinMethod{Self: &SelfJoin{}}).Validate(); err != nil {
		t.Fatalf("one branch: %v", err)
	}
	if err := (JoinMethod{}).Validate(); err == nil {
		t.Fatal("no branch must be refused")
	}
	if err := (JoinMethod{Self: &SelfJoin{}, ESI: &ESIJoin{}}).Validate(); err == nil {
		t.Fatal("two branches must be refused")
	}
}

// The `json:"-"` tags are the boundary, not a convention: an owner key holds a
// ref for the ESI kinds, and an invite's hash, binding and creator are the
// server's alone. A tag lost in an edit leaks silently, so it is asserted.
func TestPlannerDocumentsKeepServerOnlyFieldsOffTheWire(t *testing.T) {
	t.Parallel()

	planner, err := json.Marshal(Planner{
		ID:        AccountOwner("acct-1").Key(),
		Name:      "Capitals",
		CreatedBy: "acct-1",
	})
	if err != nil {
		t.Fatalf("marshal planner: %v", err)
	}
	for _, leaked := range []string{"acct-1", "account:"} {
		if strings.Contains(string(planner), leaked) {
			t.Fatalf("planner JSON leaks %q: %s", leaked, planner)
		}
	}

	invite, err := json.Marshal(PlannerInvite{
		ID:             "inv-1",
		PlannerID:      AccountOwner("acct-1").Key(),
		TokenHash:      []byte("secret"),
		BoundAccountID: "acct-2",
		CreatedBy:      "acct-1",
		ExpiresAt:      time.Unix(0, 0).UTC(),
	})
	if err != nil {
		t.Fatalf("marshal invite: %v", err)
	}
	for _, leaked := range []string{"secret", "acct-1", "acct-2", "tokenHash"} {
		if strings.Contains(string(invite), leaked) {
			t.Fatalf("invite JSON leaks %q: %s", leaked, invite)
		}
	}

	membership, err := json.Marshal(PlannerMembership{
		ID:         "m-1",
		PlannerID:  AccountOwner("acct-1").Key(),
		AccountID:  "acct-1",
		JoinMethod: JoinMethod{Self: &SelfJoin{}},
	})
	if err != nil {
		t.Fatalf("marshal membership: %v", err)
	}
	if strings.Contains(string(membership), "acct-1") {
		t.Fatalf("membership JSON leaks the account: %s", membership)
	}
}

// Owner carries no JSON tags, so it serialises under Go field names rather than
// wire-shaped ones. That is the whole of the protection: a missed conversion
// produces conspicuous "Kind"/"ID" keys instead of a well-formed field, which is
// weaker than being impossible. What actually keeps a ref off the wire is that
// every field holding an owner is tagged `json:"-"`.
func TestOwnerSerialisesConspicuouslyRatherThanCleanly(t *testing.T) {
	t.Parallel()

	out, err := json.Marshal(Owner{Kind: OwnerCorporation, ID: "corp_ref_xyz"})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	if !strings.Contains(string(out), `"Kind"`) || !strings.Contains(string(out), `"ID"`) {
		t.Fatalf("owner marshalled to %s, want unmapped Go field names", out)
	}
}
