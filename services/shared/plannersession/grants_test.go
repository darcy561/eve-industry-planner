package plannersession

import (
	"context"
	"encoding/json"
	"encoding/json/jsontext"
	"strings"
	"sync"
	"testing"
	"time"

	"eve-industry-planner/shared/crypto/entityid"
	"eve-industry-planner/shared/models"
	"eve-industry-planner/testing/keys"
	"eve-industry-planner/testing/redisfixture"
)

// grantsFor builds the owner keys a session holds, the way the callers do: the
// account's own planner plus one per organisation it is a member of.
func grantsFor(t *testing.T, accountID string, corpIDs, allianceIDs []int64) models.OwnerKeys {
	t.Helper()
	cipher := keys.EntityCipher(t)
	granted := models.NewOwnerKeys().Add(models.AccountOwner(accountID))
	for _, id := range corpIDs {
		ref, err := cipher.Corporation(id)
		if err != nil {
			t.Fatalf("corporation ref for %d: %v", id, err)
		}
		granted = granted.Add(models.CorporationOwner(ref))
	}
	for _, id := range allianceIDs {
		ref, err := cipher.Alliance(id)
		if err != nil {
			t.Fatalf("alliance ref for %d: %v", id, err)
		}
		granted = granted.Add(models.AllianceOwner(ref))
	}
	return granted
}

func corpRef(t *testing.T, id int64) string {
	t.Helper()
	ref, err := keys.EntityCipher(t).Corporation(id)
	if err != nil {
		t.Fatalf("corporation ref: %v", err)
	}
	return ref
}

func allianceRef(t *testing.T, id int64) string {
	t.Helper()
	ref, err := keys.EntityCipher(t).Alliance(id)
	if err != nil {
		t.Fatalf("alliance ref: %v", err)
	}
	return ref
}

// Overlapping grant writes must all land. A write that escapes the
// compare-and-set leaves a racing writer silently overwritten, which shows as a
// version below the number of updates.
func TestConcurrentGrantsUpdatesAreNotLost(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	s := NewStore(redisfixture.New(t).Handle)

	const (
		accountID = "acct-cas-lost-update"
		rounds    = 40
	)
	now := time.Now().UTC()
	if err := s.PutSession(ctx, accountID, Session{
		SessionID: "s1", CharacterHash: "hash", StartedAt: now, LastSeenAt: now,
	}); err != nil {
		t.Fatalf("initial put: %v", err)
	}

	// Release both writers of each pair together so their read-compare-write
	// windows overlap.
	for range rounds {
		start := make(chan struct{})
		var wg sync.WaitGroup
		wg.Add(2)
		errCh := make(chan error, 2)
		for _, corp := range []int64{1, 2} {
			go func() {
				defer wg.Done()
				<-start
				errCh <- s.SetGrants(ctx, accountID, grantsFor(t, accountID, []int64{corp}, nil))
			}()
		}
		close(start)
		wg.Wait()
		close(errCh)
		for err := range errCh {
			if err != nil {
				t.Fatalf("concurrent grants update failed: %v", err)
			}
		}
	}

	rec, err := s.LiveAccountRecord(ctx, accountID)
	if err != nil {
		t.Fatalf("record: %v", err)
	}
	if rec.GrantsVersion < rounds*2 {
		t.Fatalf("grants version = %d, want at least %d; updates were lost", rec.GrantsVersion, rounds*2)
	}
}

func TestConcurrentPutAndGrantsPreservesTheSession(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	s := NewStore(redisfixture.New(t).Handle)

	const (
		accountID = "acct-cas-concurrent"
		sessionID = "sess-cas-concurrent"
	)
	now := time.Now().UTC()

	var wg sync.WaitGroup
	wg.Add(2)
	errCh := make(chan error, 2)
	go func() {
		defer wg.Done()
		errCh <- s.PutSession(ctx, accountID, Session{
			SessionID: sessionID, CharacterHash: "main-hash", StartedAt: now, LastSeenAt: now,
		})
	}()
	go func() {
		defer wg.Done()
		time.Sleep(2 * time.Millisecond)
		errCh <- s.SetGrants(ctx, accountID, grantsFor(t, accountID, []int64{100}, []int64{200}))
	}()
	wg.Wait()
	close(errCh)
	for err := range errCh {
		if err != nil {
			t.Fatalf("concurrent mutation failed: %v", err)
		}
	}

	rec, err := s.LiveAccountRecord(ctx, accountID)
	if err != nil {
		t.Fatalf("record: %v", err)
	}
	session, ok := rec.Sessions[sessionID]
	if !ok {
		t.Fatal("expected the session to survive a concurrent grants write")
	}
	if session.CharacterHash != "main-hash" {
		t.Fatalf("session hash = %q", session.CharacterHash)
	}
	if !rec.Grants.Allows(models.CorporationOwner(corpRef(t, 100))) {
		t.Fatalf("account grants = %v", rec.Grants.OwnerKeys)
	}
	if !rec.Grants.Allows(models.AllianceOwner(allianceRef(t, 200))) {
		t.Fatalf("account grants = %v", rec.Grants.OwnerKeys)
	}
	if !session.Grants.Allows(models.CorporationOwner(corpRef(t, 100))) {
		t.Fatal("a session carries the grants the account held when it was written")
	}
}

// Grants must never persist a raw entity id: the ref is what is stored.
func TestGrantsStoreRefsNotIDs(t *testing.T) {
	ctx := context.Background()
	s := NewStore(redisfixture.New(t).Handle)

	const accountID = "acct-refs"
	if err := s.SetGrants(ctx, accountID, grantsFor(t, accountID, []int64{98765432}, []int64{99000001})); err != nil {
		t.Fatalf("set grants: %v", err)
	}

	rec, err := s.LiveAccountRecord(ctx, accountID)
	if err != nil {
		t.Fatalf("record: %v", err)
	}
	orgRefs := append(rec.Grants.OwnerKeys.IDsForKind(models.OwnerCorporation),
		rec.Grants.OwnerKeys.IDsForKind(models.OwnerAlliance)...)
	if len(orgRefs) != 2 {
		t.Fatalf("org grants = %v, want one corporation and one alliance", orgRefs)
	}
	for _, got := range orgRefs {
		if !entityid.ValidShape(got) {
			t.Fatalf("grant %q is not a well formed ref", got)
		}
		if strings.Contains(got, "98765432") || strings.Contains(got, "99000001") {
			t.Fatalf("grant %q leaks the raw entity id", got)
		}
	}
}

// The account's own key is granted without being asked for, so nothing
// downstream has to special-case the account alongside the org kinds.
func TestGrantsAlwaysIncludeTheAccountsOwnKey(t *testing.T) {
	ctx := context.Background()
	s := NewStore(redisfixture.New(t).Handle)

	const accountID = "acct-self-grant"
	if err := s.SetGrants(ctx, accountID, grantsFor(t, accountID, nil, nil)); err != nil {
		t.Fatalf("set grants: %v", err)
	}
	rec, err := s.LiveAccountRecord(ctx, accountID)
	if err != nil {
		t.Fatalf("record: %v", err)
	}
	if !rec.Grants.Allows(models.AccountOwner(accountID)) {
		t.Fatalf("grants = %v, want the account's own key", rec.Grants.OwnerKeys)
	}
}

// A grant names the kind alongside the id, so a corporation ref cannot be
// mistaken for an alliance one now that both share a list.
func TestGrantsKeepKindWithTheID(t *testing.T) {
	ctx := context.Background()
	s := NewStore(redisfixture.New(t).Handle)

	const accountID = "acct-kinded"
	if err := s.SetGrants(ctx, accountID, grantsFor(t, accountID, []int64{100}, []int64{200})); err != nil {
		t.Fatalf("set grants: %v", err)
	}
	rec, err := s.LiveAccountRecord(ctx, accountID)
	if err != nil {
		t.Fatalf("record: %v", err)
	}
	corp := corpRef(t, 100)
	if rec.Grants.Allows(models.Owner{Kind: models.OwnerAlliance, ID: corp}) {
		t.Fatal("a corporation ref must not grant the alliance of the same id")
	}
	if !rec.Grants.Allows(models.CorporationOwner(corp)) {
		t.Fatalf("grants = %v, want the corporation key", rec.Grants.OwnerKeys)
	}
}

// writeLegacyRecord stores a record in the shape the previous release wrote.
func writeLegacyRecord(t *testing.T, ctx context.Context, r *redisfixture.Redis, accountID string, corpRefs, allianceRefs []string) {
	t.Helper()
	payload, err := json.Marshal(map[string]any{
		"account_id": accountID,
		"grants": map[string]any{
			"corporation_refs": corpRefs,
			"alliance_refs":    allianceRefs,
		},
		"sessions": map[string]any{
			"s1": map[string]any{"session_id": "s1", "character_hash": "hash-1"},
		},
		"grants_version": 3,
	})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	if err := r.Client.Set(ctx, AccountSessionsKeyPrefix+accountID, payload, SessionTTL).Err(); err != nil {
		t.Fatalf("seed: %v", err)
	}
}

// The previous shape decodes to no grants at all, so the repair is what puts the
// corporation and alliance back before anyone reconnects.
func TestRepairGrantsRewritesTheLegacyShape(t *testing.T) {
	ctx := context.Background()
	r := redisfixture.New(t)
	s := NewStore(r.Handle)
	corp, alliance := corpRef(t, 100), allianceRef(t, 200)

	writeLegacyRecord(t, ctx, r, "acct-legacy", []string{corp}, []string{alliance})

	report, err := s.RepairGrants(ctx, false)
	if err != nil {
		t.Fatalf("repair: %v", err)
	}
	if report.Scanned != 1 || report.Repaired != 1 || report.Failed != 0 {
		t.Fatalf("report = %+v, want 1 scanned, 1 repaired, 0 failed", report)
	}

	rec, err := s.LiveAccountRecord(ctx, "acct-legacy")
	if err != nil {
		t.Fatalf("reload: %v", err)
	}
	for _, want := range []models.Owner{
		models.AccountOwner("acct-legacy"),
		models.CorporationOwner(corp),
		models.AllianceOwner(alliance),
	} {
		if !rec.Grants.Allows(want) {
			t.Fatalf("grants = %v, want to include %s", rec.Grants.OwnerKeys, want.Key())
		}
	}
}

// The record also holds the session map that keeps an account signed in, so the
// repair must leave it alone.
func TestRepairGrantsKeepsSessions(t *testing.T) {
	ctx := context.Background()
	r := redisfixture.New(t)
	s := NewStore(r.Handle)
	writeLegacyRecord(t, ctx, r, "acct-keep", []string{corpRef(t, 1)}, nil)

	if _, err := s.RepairGrants(ctx, false); err != nil {
		t.Fatalf("repair: %v", err)
	}
	rec, err := s.LiveAccountRecord(ctx, "acct-keep")
	if err != nil {
		t.Fatalf("reload: %v", err)
	}
	session, ok := rec.Sessions["s1"]
	if !ok {
		t.Fatalf("sessions = %v, want s1 to survive the repair", rec.Sessions)
	}
	if session.CharacterHash != "hash-1" {
		t.Fatalf("session hash = %q", session.CharacterHash)
	}
	if !session.Grants.Allows(models.AccountOwner("acct-keep")) {
		t.Fatal("session-level grants are rewritten with the record")
	}
}

// Re-running the release must not rewrite what it already wrote.
func TestRepairGrantsIsIdempotent(t *testing.T) {
	ctx := context.Background()
	r := redisfixture.New(t)
	s := NewStore(r.Handle)
	writeLegacyRecord(t, ctx, r, "acct-twice", []string{corpRef(t, 5)}, nil)

	if _, err := s.RepairGrants(ctx, false); err != nil {
		t.Fatalf("first pass: %v", err)
	}
	second, err := s.RepairGrants(ctx, false)
	if err != nil {
		t.Fatalf("second pass: %v", err)
	}
	if second.Repaired != 0 {
		t.Fatalf("second pass repaired %d, want 0", second.Repaired)
	}
}

// A dry run reports what it would do and writes nothing.
func TestRepairGrantsDryRunWritesNothing(t *testing.T) {
	ctx := context.Background()
	r := redisfixture.New(t)
	s := NewStore(r.Handle)
	writeLegacyRecord(t, ctx, r, "acct-dry", []string{corpRef(t, 7)}, nil)

	report, err := s.RepairGrants(ctx, true)
	if err != nil {
		t.Fatalf("repair: %v", err)
	}
	if report.Repaired != 1 {
		t.Fatalf("dry run repaired = %d, want 1 reported", report.Repaired)
	}

	var raw map[string]jsontext.Value
	if err := r.Handle.GetJSON(ctx, AccountSessionsKeyPrefix+"acct-dry", &raw); err != nil {
		t.Fatalf("reload raw: %v", err)
	}
	var stored struct {
		OwnerKeys []string `json:"owner_keys"`
	}
	if err := json.Unmarshal(raw["grants"], &stored); err != nil {
		t.Fatalf("decode grants: %v", err)
	}
	if len(stored.OwnerKeys) != 0 {
		t.Fatalf("dry run wrote %v", stored.OwnerKeys)
	}
}

// An account already on the new shape gains its own key without losing what it holds.
func TestRepairGrantsAddsTheAccountsOwnKey(t *testing.T) {
	ctx := context.Background()
	r := redisfixture.New(t)
	s := NewStore(r.Handle)
	corp := corpRef(t, 42)

	payload, err := json.Marshal(map[string]any{
		"account_id": "acct-partial",
		"grants":     map[string]any{"owner_keys": []string{models.CorporationOwner(corp).Key()}},
		"sessions":   map[string]any{},
	})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	if err := r.Client.Set(ctx, AccountSessionsKeyPrefix+"acct-partial", payload, SessionTTL).Err(); err != nil {
		t.Fatalf("seed: %v", err)
	}

	if _, err := s.RepairGrants(ctx, false); err != nil {
		t.Fatalf("repair: %v", err)
	}
	rec, err := s.LiveAccountRecord(ctx, "acct-partial")
	if err != nil {
		t.Fatalf("reload: %v", err)
	}
	if !rec.Grants.Allows(models.AccountOwner("acct-partial")) {
		t.Fatalf("grants = %v, want the account's own key", rec.Grants.OwnerKeys)
	}
	if !rec.Grants.Allows(models.CorporationOwner(corp)) {
		t.Fatalf("grants = %v, want the corporation it already held", rec.Grants.OwnerKeys)
	}
}

// A scan reports an id as stored, so a record written under a key carrying
// whitespace must be repaired at the key it was found under rather than one
// rebuilt from the id.
func TestRepairGrantsReachesAnUntrimmedRecord(t *testing.T) {
	ctx := context.Background()
	r := redisfixture.New(t)
	s := NewStore(r.Handle)
	writeLegacyRecord(t, ctx, r, " acct-untrimmed ", []string{corpRef(t, 9)}, nil)

	report, err := s.RepairGrants(ctx, false)
	if err != nil {
		t.Fatalf("repair: %v", err)
	}
	if report.Scanned != 1 || report.Failed != 0 {
		t.Fatalf("report = %+v, want the untrimmed record scanned and not failed", report)
	}
}
