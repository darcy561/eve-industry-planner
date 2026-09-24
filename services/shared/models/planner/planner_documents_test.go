package planner_test

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	"eve-industry-planner/shared/models"
	"eve-industry-planner/shared/models/planner"
)

// A corporation owner key holds a ref, so a test asserting one needs a real one.
const validCorpRef = "corp_56_J_DzQdPpjXwi9Xtp3C8bri9Bfi0Z94qUulkbKCac"

// The planner's id is its owner key, so the owner is stored once rather than
// beside a copy of itself that could disagree.
func TestPlannerReadsItsOwnerFromItsID(t *testing.T) {
	t.Parallel()

	owner, err := planner.Planner{ID: models.AccountOwner("acct-1").Key()}.Owner()
	if err != nil {
		t.Fatalf("Owner: %v", err)
	}
	if owner != models.AccountOwner("acct-1") {
		t.Fatalf("owner = %+v", owner)
	}

	if _, err := (planner.Planner{ID: "not-a-key"}).Owner(); err == nil {
		t.Fatal("an id that is not an owner key must not read back as one")
	}
}

func TestPlannerIsSharedOnlyAboveOneMember(t *testing.T) {
	t.Parallel()

	for _, tc := range []struct {
		members int
		shared  bool
	}{{0, false}, {1, false}, {2, true}} {
		if got := (planner.Planner{MemberCount: tc.members}).Shared(); got != tc.shared {
			t.Errorf("%d members: shared = %v, want %v", tc.members, got, tc.shared)
		}
	}
}

// The branch that is set is the method, so none set and two set are both
// meaningless — and two would let a reader pick either answer.
func TestJoinMethodWantsExactlyOneBranch(t *testing.T) {
	t.Parallel()

	if err := (planner.JoinMethod{Owner: &planner.OwnerAccount{}}).Validate(); err != nil {
		t.Fatalf("one branch: %v", err)
	}
	if err := (planner.JoinMethod{}).Validate(); err == nil {
		t.Fatal("no branch must be refused")
	}
	if err := (planner.JoinMethod{Owner: &planner.OwnerAccount{}, Membership: &planner.EntityMember{}}).Validate(); err == nil {
		t.Fatal("two branches must be refused")
	}
}

// The `json:"-"` tags are the boundary, not a convention: an owner key holds a
// ref for the ESI kinds, and an invite's hash, binding and creator are the
// server's alone. A tag lost in an edit leaks silently, so it is asserted.
func TestPlannerDocumentsKeepServerOnlyFieldsOffTheWire(t *testing.T) {
	t.Parallel()

	plannerJSON, err := json.Marshal(planner.Planner{
		ID:        models.AccountOwner("acct-1").Key(),
		Name:      "Capitals",
		CreatedBy: "acct-1",
	})
	if err != nil {
		t.Fatalf("marshal planner: %v", err)
	}
	for _, leaked := range []string{"acct-1", "account:"} {
		if strings.Contains(string(plannerJSON), leaked) {
			t.Fatalf("planner JSON leaks %q: %s", leaked, plannerJSON)
		}
	}

	// The invite record is itself stored as JSON, so what a client sees is a
	// separate view rather than the same struct with fields tagged away.
	invite, err := json.Marshal(planner.Invite{
		ID:             "inv-1",
		PlannerID:      models.AccountOwner("acct-1").Key(),
		TokenHash:      []byte("secret"),
		BoundAccountID: "acct-2",
		CreatedBy:      "acct-1",
		ExpiresAt:      time.Unix(0, 0).UTC(),
	}.Summary())
	if err != nil {
		t.Fatalf("marshal invite: %v", err)
	}
	for _, leaked := range []string{"secret", "acct-1", "acct-2", "tokenHash"} {
		if strings.Contains(string(invite), leaked) {
			t.Fatalf("invite summary leaks %q: %s", leaked, invite)
		}
	}

	membership, err := json.Marshal(planner.Membership{
		ID:         "m-1",
		PlannerID:  models.AccountOwner("acct-1").Key(),
		AccountID:  "acct-1",
		JoinMethod: planner.JoinMethod{Owner: &planner.OwnerAccount{}},
	})
	if err != nil {
		t.Fatalf("marshal membership: %v", err)
	}
	if strings.Contains(string(membership), "acct-1") {
		t.Fatalf("membership JSON leaks the account: %s", membership)
	}
}

// One row per account per planner, without a unique index to enforce it.
func TestPlannerMembershipIDIsOneRowPerAccountPerPlanner(t *testing.T) {
	t.Parallel()
	plannerID := models.AccountOwner("acct-1").Key()
	if got, want := planner.MembershipID(plannerID, "acct-1"), "account:acct-1|acct-1"; got != want {
		t.Fatalf("planner.MembershipID = %q, want %q", got, want)
	}
	if planner.MembershipID(plannerID, "acct-1") == planner.MembershipID(plannerID, "acct-2") {
		t.Fatal("two accounts in one planner must not share a row id")
	}
	if planner.MembershipID(plannerID, "acct-1") == planner.MembershipID("planner:01H", "acct-1") {
		t.Fatal("one account in two planners must not share a row id")
	}
}

// The row id has to survive the trip back: the planner id is everything before the
// last separator, because an owner key leads with its kind and a colon.
func TestPlannerMembershipIDSplitsBackToItsParts(t *testing.T) {
	t.Parallel()
	for _, plannerID := range []string{
		models.AccountOwner("acct1").Key(),
		"planner:01HZY6R3QK7T9V2M4N8P0XW5AB",
		models.CorporationOwner(validCorpRef).Key(),
	} {
		id := planner.MembershipID(plannerID, "acct1")
		gotPlanner, gotAccount, ok := planner.SplitMembershipID(id)
		if !ok {
			t.Fatalf("planner.SplitMembershipID(%q) reported no split", id)
		}
		if gotPlanner != plannerID || gotAccount != "acct1" {
			t.Fatalf("split %q = (%q, %q), want (%q, %q)", id, gotPlanner, gotAccount, plannerID, "acct1")
		}
	}
	for _, bad := range []string{"", "|", "no-separator", "trailing|"} {
		if _, _, ok := planner.SplitMembershipID(bad); ok {
			t.Fatalf("planner.SplitMembershipID(%q) reported a split", bad)
		}
	}
}

// The populated branch is the discriminator, so Kind reads it rather than a
// stored constant that could disagree with it.
func TestJoinMethodKindReadsThePopulatedBranch(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name   string
		method planner.JoinMethod
		want   planner.JoinKind
	}{
		{"owner", planner.JoinMethod{Owner: &planner.OwnerAccount{}}, planner.JoinKindOwner},
		{"invite", planner.JoinMethod{Invite: &planner.InviteRedemption{}}, planner.JoinKindInvite},
		{"entity member", planner.JoinMethod{Membership: &planner.EntityMember{}}, planner.JoinKindMember},
		{"access list", planner.JoinMethod{AccessList: &planner.AccessListEntry{}}, planner.JoinKindAccessList},
		{"none", planner.JoinMethod{}, ""},
	}
	for _, c := range cases {
		if got := c.method.Kind(); got != c.want {
			t.Fatalf("%s: Kind = %q, want %q", c.name, got, c.want)
		}
	}
}

// A planner's _meta is the shared core and nothing more: it carries no
// LastUpdatedBy, because a planner document is not edited by its members.
func TestPlannerCarriesTheSharedMeta(t *testing.T) {
	t.Parallel()
	p := planner.Planner{ID: models.AccountOwner("acct-1").Key()}
	p.MetaData.Owner = models.AccountOwner("acct-1")
	owner, err := p.Owner()
	if err != nil {
		t.Fatalf("Owner: %v", err)
	}
	if owner != p.MetaData.Owner {
		t.Fatalf("owner from id = %v, want %v", owner, p.MetaData.Owner)
	}
}

// A document the change stream delivers must carry `_meta.lastModified`: the SPA
// reads it as its ordering cursor and drops a message without one, so a model
// that omits it opts out of realtime silently rather than loudly.
func TestPlannerDocumentsCarryTheRealtimeCursor(t *testing.T) {
	t.Parallel()
	now := time.Unix(1700000000, 0).UTC()
	owner := models.AccountOwner("acct-1")

	for _, tc := range []struct {
		name string
		meta models.MetaData
	}{
		{"planner", planner.Planner{MetaData: models.MetaData{LastModified: now, Owner: owner}}.MetaData},
		{"membership", planner.Membership{MetaData: models.MetaData{LastModified: now, Owner: owner}}.MetaData},
		{"settings", planner.DefaultSettings(owner, now).MetaData},
	} {
		if tc.meta.LastModified.IsZero() {
			t.Errorf("%s: _meta.lastModified is zero", tc.name)
		}
		if tc.meta.Owner.IsZero() {
			t.Errorf("%s: _meta.owner is zero", tc.name)
		}
	}
}

// The settings' id is its owner key, as the planner's is.
func TestPlannerSettingsReadsItsOwnerFromItsID(t *testing.T) {
	t.Parallel()
	owner := models.AccountOwner("acct-1")
	settings := planner.DefaultSettings(owner, time.Unix(0, 0).UTC())

	got, err := settings.Owner()
	if err != nil {
		t.Fatalf("Owner: %v", err)
	}
	if got != owner {
		t.Fatalf("owner = %+v, want %+v", got, owner)
	}
	if got != settings.MetaData.Owner {
		t.Fatalf("owner from id = %v, want the one in _meta %v", got, settings.MetaData.Owner)
	}
}

// Seeding takes the planner-side settings and leaves the account-side ones where
// they are: those decide how one person sees their own screen, wherever they work.
func TestPlannerSettingsSeedTakesOnlyThePlannerSide(t *testing.T) {
	t.Parallel()
	now := time.Unix(1700000000, 0).UTC()
	owner := models.AccountOwner("acct-1")

	account := models.DefaultApplicationSettings("acct-1", now)
	account.DefaultMaterialEfficiencyValue = 7
	account.DefaultCitadelBrokersFee = 2.5
	account.CustomStructures = models.CustomStructures{{ID: "s-1", JobType: models.JobTypeManufacturing, Name: "Home"}}
	account.ExemptTypeIDs = []int{34}
	// Account-side: this has no field on the planner's settings to land in.
	account.EnableCompactLayoutView = true

	seeded := planner.SettingsFromAccount(owner, account, now)

	if seeded.DefaultMaterialEfficiencyValue != 7 {
		t.Errorf("ME = %d, want 7", seeded.DefaultMaterialEfficiencyValue)
	}
	if seeded.DefaultCitadelBrokersFee != 2.5 {
		t.Errorf("brokers fee = %v, want 2.5", seeded.DefaultCitadelBrokersFee)
	}
	if len(seeded.CustomStructures) != 1 {
		t.Errorf("custom structures = %+v", seeded.CustomStructures)
	}
	if len(seeded.ExemptTypeIDs) != 1 || seeded.ExemptTypeIDs[0] != 34 {
		t.Errorf("exempt type ids = %v", seeded.ExemptTypeIDs)
	}
	if seeded.SchemaVersion != planner.SettingsSchemaCurrent {
		t.Errorf("schema version = %d", seeded.SchemaVersion)
	}
	if seeded.ID != owner.Key() {
		t.Errorf("id = %q, want %q", seeded.ID, owner.Key())
	}
}

// A planner with nothing to seed from still gets the shared defaults, so its
// extras categories are the frozen ids every account already shares.
func TestDefaultPlannerSettingsHoldsTheSharedDefaults(t *testing.T) {
	t.Parallel()
	settings := planner.DefaultSettings(models.AccountOwner("acct-1"), time.Unix(0, 0).UTC())

	if len(settings.ExtrasCategories) != len(models.DefaultExtrasCategories()) {
		t.Fatalf("extras categories = %d, want %d",
			len(settings.ExtrasCategories), len(models.DefaultExtrasCategories()))
	}
	if settings.PredefinedSystemIndexes == nil {
		t.Error("predefined system indexes must be an empty map rather than nil")
	}
	if settings.ExemptTypeIDs == nil {
		t.Error("exempt type ids must be an empty slice rather than nil")
	}
}

// The account's settings stay live in the caller after seeding, so a shared slice
// or map would let an edit to one show up in the other.
func TestPlannerSettingsSeedCopiesRatherThanShares(t *testing.T) {
	t.Parallel()
	now := time.Unix(1700000000, 0).UTC()

	account := models.DefaultApplicationSettings("acct-1", now)
	account.CustomStructures = models.CustomStructures{{ID: "s-1", JobType: models.JobTypeManufacturing, Name: "Home"}}
	account.ExtrasCategories = models.DefaultExtrasCategories()
	account.ExemptTypeIDs = []int{34}
	account.PredefinedSystemIndexes = map[string]map[string]float64{
		"30000142": {"manufacturing": 0.05},
	}

	seeded := planner.SettingsFromAccount(models.AccountOwner("acct-1"), account, now)

	account.CustomStructures[0].Name = "Renamed on the account"
	account.ExtrasCategories[0].Label = "Renamed on the account"
	account.ExemptTypeIDs[0] = 35
	account.PredefinedSystemIndexes["30000142"]["manufacturing"] = 0.99

	if seeded.CustomStructures[0].Name != "Home" {
		t.Error("a structure renamed on the account changed the planner's copy")
	}
	if seeded.ExtrasCategories[0].Label == "Renamed on the account" {
		t.Error("a category renamed on the account changed the planner's copy")
	}
	if seeded.ExemptTypeIDs[0] != 34 {
		t.Error("an exempt type changed on the account changed the planner's copy")
	}
	if seeded.PredefinedSystemIndexes["30000142"]["manufacturing"] != 0.05 {
		t.Error("a system index changed on the account changed the planner's copy")
	}
}
