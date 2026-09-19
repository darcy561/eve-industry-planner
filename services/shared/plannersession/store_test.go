package plannersession

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"eve-industry-planner/shared/dependency"
	eipredis "eve-industry-planner/shared/redis"
	"eve-industry-planner/testing/redisfixture"
)

func TestPutRefreshTokenPointsTheSessionAtIt(t *testing.T) {
	ctx := context.Background()
	r := redisfixture.New(t)
	s := NewStore(r.Handle)

	data := RefreshTokenData{AccountID: "acct", SessionID: "sess"}
	if err := s.PutRefreshToken(ctx, "tok", data); err != nil {
		t.Fatalf("put: %v", err)
	}

	got, found, err := s.RefreshToken(ctx, "tok")
	if err != nil || !found {
		t.Fatalf("read back: found=%v err=%v", found, err)
	}
	if got.SessionID != "sess" {
		t.Fatalf("session id = %q", got.SessionID)
	}
	token, found, err := s.TokenForSession(ctx, "sess")
	if err != nil || !found || token != "tok" {
		t.Fatalf("index should name the token: %q found=%v err=%v", token, found, err)
	}
}

// A rotation writes the new token's index entry before revoking the old one, so
// deleting the superseded token must not clear the pointer to its replacement.
func TestDeleteRefreshTokenLeavesANewerTokensIndexAlone(t *testing.T) {
	ctx := context.Background()
	r := redisfixture.New(t)
	s := NewStore(r.Handle)

	old := RefreshTokenData{AccountID: "acct", SessionID: "sess"}
	if err := s.PutRefreshToken(ctx, "old", old); err != nil {
		t.Fatalf("put old: %v", err)
	}
	if err := s.PutRefreshToken(ctx, "new", old); err != nil {
		t.Fatalf("put new: %v", err)
	}
	if err := s.DeleteRefreshToken(ctx, "old"); err != nil {
		t.Fatalf("delete old: %v", err)
	}

	token, found, err := s.TokenForSession(ctx, "sess")
	if err != nil || !found || token != "new" {
		t.Fatalf("index should still name the replacement: %q found=%v err=%v", token, found, err)
	}
}

func TestDeleteRefreshTokenClearsItsOwnIndex(t *testing.T) {
	ctx := context.Background()
	r := redisfixture.New(t)
	s := NewStore(r.Handle)

	if err := s.PutRefreshToken(ctx, "tok", RefreshTokenData{SessionID: "sess"}); err != nil {
		t.Fatalf("put: %v", err)
	}
	if err := s.DeleteRefreshToken(ctx, "tok"); err != nil {
		t.Fatalf("delete: %v", err)
	}
	if _, found, _ := s.TokenForSession(ctx, "sess"); found {
		t.Fatal("index should be gone with the token it named")
	}
}

// The record and the session index are the pair that makes a session
// resolvable; writing one without the other is the failure the store exists to
// prevent.
func TestPutSessionWritesTheRecordAndTheIndex(t *testing.T) {
	ctx := context.Background()
	r := redisfixture.New(t)
	s := NewStore(r.Handle)

	if err := s.PutSession(ctx, "acct", Session{SessionID: "sess"}); err != nil {
		t.Fatalf("put session: %v", err)
	}

	rec, found, err := s.AccountRecord(ctx, "acct")
	if err != nil || !found {
		t.Fatalf("record: found=%v err=%v", found, err)
	}
	if _, ok := rec.Sessions["sess"]; !ok {
		t.Fatal("record should hold the session")
	}
	account, found, err := s.AccountForSession(ctx, "sess")
	if err != nil || !found || account != "acct" {
		t.Fatalf("index should resolve the account: %q found=%v err=%v", account, found, err)
	}
}

func TestRemoveSessionClearsBothIndexes(t *testing.T) {
	ctx := context.Background()
	r := redisfixture.New(t)
	s := NewStore(r.Handle)

	if err := s.PutSession(ctx, "acct", Session{SessionID: "sess"}); err != nil {
		t.Fatalf("put session: %v", err)
	}
	if err := s.PointSessionAtToken(ctx, "sess", "tok"); err != nil {
		t.Fatalf("point: %v", err)
	}
	if err := s.RemoveSession(ctx, "acct", "sess"); err != nil {
		t.Fatalf("remove: %v", err)
	}

	if _, found, _ := s.AccountForSession(ctx, "sess"); found {
		t.Fatal("session index should be gone")
	}
	if _, found, _ := s.TokenForSession(ctx, "sess"); found {
		t.Fatal("refresh index should be gone")
	}
}

func TestPutSessionStampsTheDefaultsASessionNeeds(t *testing.T) {
	ctx := context.Background()
	r := redisfixture.New(t)
	s := NewStore(r.Handle)

	if err := s.PutSession(ctx, "acct", Session{SessionID: "sess"}); err != nil {
		t.Fatalf("put session: %v", err)
	}
	rec, _, err := s.AccountRecord(ctx, "acct")
	if err != nil {
		t.Fatalf("record: %v", err)
	}
	session := rec.Sessions["sess"]
	if session.StartedAt.IsZero() || session.LastSeenAt.IsZero() {
		t.Fatal("a stored session carries when it started and was last seen")
	}
	if !session.ReauthRequiredAt.Equal(ReauthDeadlineFromSessionStart(session.StartedAt)) {
		t.Fatalf("reauth deadline = %v", session.ReauthRequiredAt)
	}
}

func TestConcurrentRecordUpdatesAreNotLost(t *testing.T) {
	ctx := context.Background()
	r := redisfixture.New(t)
	s := NewStore(r.Handle)

	const writers = 8
	var wg sync.WaitGroup
	wg.Add(writers)
	for i := range writers {
		go func() {
			defer wg.Done()
			sid := string(rune('a' + i))
			_ = s.UpdateAccountRecord(ctx, "acct", func(rec *AccountRecord) error {
				rec.Sessions[sid] = Session{SessionID: sid, StartedAt: time.Now().UTC()}
				return nil
			})
		}()
	}
	wg.Wait()

	rec, _, err := s.AccountRecord(ctx, "acct")
	if err != nil {
		t.Fatalf("record: %v", err)
	}
	if len(rec.Sessions) != writers {
		t.Fatalf("kept %d of %d concurrent writes", len(rec.Sessions), writers)
	}
}

func TestUpdateAbandonsOnMutateError(t *testing.T) {
	ctx := context.Background()
	r := redisfixture.New(t)
	s := NewStore(r.Handle)

	sentinel := errors.New("no")
	if err := s.UpdateAccountRecord(ctx, "acct", func(*AccountRecord) error { return sentinel }); !errors.Is(err, sentinel) {
		t.Fatalf("error = %v, want the mutate error", err)
	}
	if _, found, _ := s.AccountRecord(ctx, "acct"); found {
		t.Fatal("an abandoned update must not write a record")
	}
}

// Expiry is a property of touching the record at all: a session past its
// deadline goes on the next read or write, and its indexes go with it.
func TestExpiredSessionsArePrunedAndTheirIndexesDeleted(t *testing.T) {
	ctx := context.Background()
	r := redisfixture.New(t)
	s := NewStore(r.Handle)

	stale := time.Now().UTC().Add(-2 * RefreshTokenTTL)
	if err := s.PutSession(ctx, "acct", Session{SessionID: "old", StartedAt: stale, LastSeenAt: stale}); err != nil {
		t.Fatalf("put session: %v", err)
	}
	if err := s.PointSessionAtToken(ctx, "old", "tok"); err != nil {
		t.Fatalf("point: %v", err)
	}

	rec, err := s.LiveAccountRecord(ctx, "acct")
	if err != nil {
		t.Fatalf("live record: %v", err)
	}
	if len(rec.Sessions) != 0 {
		t.Fatalf("expired session still reported live: %v", rec.Sessions)
	}
	if _, found, _ := s.AccountForSession(ctx, "old"); found {
		t.Fatal("a pruned session must not keep its index")
	}
}

func TestResolveSessionReportsAnUnknownIDNotFound(t *testing.T) {
	ctx := context.Background()
	r := redisfixture.New(t)
	s := NewStore(r.Handle)

	account, session, err := s.ResolveSession(ctx, "nope")
	if !errors.Is(err, ErrSessionNotFound) {
		t.Fatalf("error = %v, want ErrSessionNotFound", err)
	}
	if account != "" || session != nil {
		t.Fatalf("nothing should resolve: account=%q session=%v", account, session)
	}
}

// An index that resolves to an account whose record no longer holds the session
// is stranded; resolving it reports the account, so a caller can tell this apart
// from an id nothing indexes, and the index is cleaned up.
func TestResolveSessionClearsAStrandedIndex(t *testing.T) {
	ctx := context.Background()
	r := redisfixture.New(t)
	s := NewStore(r.Handle)

	if err := s.PutSessionIndex(ctx, "sess", "acct"); err != nil {
		t.Fatalf("put index: %v", err)
	}

	account, session, err := s.ResolveSession(ctx, "sess")
	if !errors.Is(err, ErrSessionNotFound) || session != nil {
		t.Fatalf("error = %v session = %v", err, session)
	}
	if account != "acct" {
		t.Fatalf("account = %q, want the one the index named", account)
	}
	if _, found, _ := s.AccountForSession(ctx, "sess"); found {
		t.Fatal("the stranded index should have been deleted")
	}
}

// The index can be missing while the token is not; the scan is what keeps such a
// session usable, and it repoints the index so the next lookup is cheap.
func TestFindTokenForSessionFallsBackToAScanAndRepoints(t *testing.T) {
	ctx := context.Background()
	r := redisfixture.New(t)
	s := NewStore(r.Handle)

	if err := s.PutRefreshToken(ctx, "tok", RefreshTokenData{SessionID: "sess"}); err != nil {
		t.Fatalf("put: %v", err)
	}
	if _, err := r.Client.Del(ctx, SessionRefreshIndexKeyPrefix+"sess").Result(); err != nil {
		t.Fatalf("drop index: %v", err)
	}

	token, found, err := s.FindTokenForSession(ctx, "sess")
	if err != nil || !found || token != "tok" {
		t.Fatalf("scan should find it: %q found=%v err=%v", token, found, err)
	}
	if got, found, _ := s.TokenForSession(ctx, "sess"); !found || got != "tok" {
		t.Fatalf("index should have been repointed, got %q found=%v", got, found)
	}
}

func TestRevokeSessionTokensRevokesTheIndexedOneToo(t *testing.T) {
	ctx := context.Background()
	r := redisfixture.New(t)
	s := NewStore(r.Handle)

	if err := s.PutRefreshToken(ctx, "current", RefreshTokenData{SessionID: "sess"}); err != nil {
		t.Fatalf("put current: %v", err)
	}
	if err := s.PutRefreshToken(ctx, "stale", RefreshTokenData{SessionID: "sess"}); err != nil {
		t.Fatalf("put stale: %v", err)
	}
	// "stale" was written second, so it is what the index names; the caller
	// presents the other one.
	if err := s.RevokeSessionTokens(ctx, "current", "sess"); err != nil {
		t.Fatalf("revoke: %v", err)
	}

	for _, token := range []string{"current", "stale"} {
		if _, found, _ := s.RefreshToken(ctx, token); found {
			t.Fatalf("token %q should be revoked", token)
		}
	}
}

// Pinned against literals, not against the constants: a lifetime asserted
// against the constant that set it cannot catch the constant itself being wrong,
// and these bound how long a planner session survives.
func TestSessionKeyLifetimes(t *testing.T) {
	for name, tc := range map[string]struct {
		got  time.Duration
		want time.Duration
	}{
		"refresh token": {RefreshTokenTTL, 7 * 24 * time.Hour},
		"session":       {SessionTTL, 7 * 24 * time.Hour},
		"org id cache":  {CorporationTTL, 30 * 24 * time.Hour},
	} {
		t.Run(name, func(t *testing.T) {
			if tc.got != tc.want {
				t.Errorf("ttl = %v, want %v", tc.got, tc.want)
			}
		})
	}
}

func TestKeysCarryTheirLifetimes(t *testing.T) {
	ctx := context.Background()
	r := redisfixture.New(t)
	s := NewStore(r.Handle)

	if err := s.PutRefreshToken(ctx, "tok", RefreshTokenData{SessionID: "sess"}); err != nil {
		t.Fatalf("put token: %v", err)
	}
	if err := s.PutSession(ctx, "acct", Session{SessionID: "sess"}); err != nil {
		t.Fatalf("put session: %v", err)
	}
	if err := s.PutCorporations(ctx, "acct", []int64{1}); err != nil {
		t.Fatalf("put corps: %v", err)
	}

	for key, want := range map[string]time.Duration{
		RefreshTokenKeyPrefix + "tok":         RefreshTokenTTL,
		SessionRefreshIndexKeyPrefix + "sess": RefreshTokenTTL,
		AccountSessionsKeyPrefix + "acct":     SessionTTL,
		SessionIndexKeyPrefix + "sess":        SessionTTL,
		CorporationKeyPrefix + "acct":         CorporationTTL,
	} {
		if got := r.Server.TTL(key); got != want {
			t.Errorf("%s ttl = %v, want %v", key, got, want)
		}
	}
}

func TestIdsAreTrimmedEverywhere(t *testing.T) {
	ctx := context.Background()
	r := redisfixture.New(t)
	s := NewStore(r.Handle)

	if err := s.PutSession(ctx, "  acct  ", Session{SessionID: "  sess  "}); err != nil {
		t.Fatalf("put session: %v", err)
	}
	if !r.Server.Exists(AccountSessionsKeyPrefix + "acct") {
		t.Fatal("account key should be written trimmed")
	}
	if !r.Server.Exists(SessionIndexKeyPrefix + "sess") {
		t.Fatal("session index should be written trimmed")
	}

	if err := s.PutRefreshToken(ctx, "  tok  ", RefreshTokenData{SessionID: "  sess  "}); err != nil {
		t.Fatalf("put token: %v", err)
	}
	if !r.Server.Exists(RefreshTokenKeyPrefix + "tok") {
		t.Fatal("refresh token should be written trimmed")
	}
	if _, found, err := s.RefreshToken(ctx, "  tok  "); err != nil || !found {
		t.Fatalf("an untrimmed token should read back: found=%v err=%v", found, err)
	}
}

func TestAStoreWithoutRedisReportsItself(t *testing.T) {
	ctx := context.Background()
	for name, s := range map[string]*Store{
		"nil store":             nil,
		"handle with no client": NewStore(eipredis.NewRedis(nil)),
	} {
		if _, _, err := s.RefreshToken(ctx, "tok"); !errors.Is(err, ErrNoStore) {
			t.Errorf("%s: error = %v, want ErrNoStore", name, err)
		}
	}
}

func TestOrgIDsNeverReportNil(t *testing.T) {
	ctx := context.Background()
	r := redisfixture.New(t)
	s := NewStore(r.Handle)

	if got := s.Corporations(ctx, "unknown"); got == nil {
		t.Fatal("a cache miss must still be rangeable")
	}
	if err := s.PutAlliances(ctx, "acct", []int64{99}); err != nil {
		t.Fatalf("put: %v", err)
	}
	if got := s.Alliances(ctx, "acct"); len(got) != 1 || got[0] != 99 {
		t.Fatalf("alliances = %v", got)
	}
}

func TestAccountIDFromCharacterHashKeepsOnlyAlphanumerics(t *testing.T) {
	if got := AccountIDFromCharacterHash("ab-cd_ef 12"); got != "abcdef12" {
		t.Fatalf("account id = %q", got)
	}
}

func TestTouchStampsLastSeenAndAppVersion(t *testing.T) {
	ctx := context.Background()
	r := redisfixture.New(t)
	s := NewStore(r.Handle)

	if err := s.PutSession(ctx, "acct", Session{SessionID: "sess"}); err != nil {
		t.Fatalf("put session: %v", err)
	}
	if err := s.Touch(ctx, "acct", "sess", "1.2.3"); err != nil {
		t.Fatalf("touch: %v", err)
	}
	rec, _, err := s.AccountRecord(ctx, "acct")
	if err != nil {
		t.Fatalf("record: %v", err)
	}
	if got := rec.Sessions["sess"].AppVersion; got != "1.2.3" {
		t.Fatalf("app version = %q", got)
	}
	if err := s.Touch(ctx, "acct", "missing", ""); !errors.Is(err, ErrSessionNotFound) {
		t.Fatalf("touching an absent session: %v", err)
	}
}

// SessionRow is what the reauth checks read, and they must see a session the
// pruning readers would have dropped — that is how an expired chain is
// recognised rather than silently forgotten.
func TestSessionRowReadsWithoutPruning(t *testing.T) {
	ctx := context.Background()
	r := redisfixture.New(t)
	s := NewStore(r.Handle)

	stale := time.Now().UTC().Add(-2 * RefreshTokenTTL)
	if err := s.PutSession(ctx, "acct", Session{SessionID: "old", StartedAt: stale, LastSeenAt: stale}); err != nil {
		t.Fatalf("put session: %v", err)
	}

	session, err := s.SessionRow(ctx, "old")
	if err != nil {
		t.Fatalf("session row: %v", err)
	}
	if !IsReauthExpired(session.StartedAt, session.ReauthRequiredAt, time.Now().UTC()) {
		t.Fatal("the row read back should still be recognisably expired")
	}
	if _, err := s.SessionRow(ctx, "missing"); !errors.Is(err, ErrSessionNotFound) {
		t.Fatalf("absent session: %v", err)
	}
}

// A store with no connection must classify as a dependency outage, not as a bad
// request: the middleware above it chooses 503 or 401 on exactly this.
func TestErrNoStoreIsADependencyOutage(t *testing.T) {
	if !errors.Is(ErrNoStore, eipredis.ErrNoClient) {
		t.Fatal("ErrNoStore should wrap the redis handle's own sentinel")
	}
	if !dependency.IsUnavailable(ErrNoStore) {
		t.Fatal("ErrNoStore should be classified as an unavailable dependency")
	}
	if err := NewStore(eipredis.NewRedis(nil)).Available(); !errors.Is(err, ErrNoStore) {
		t.Fatalf("Available() = %v, want ErrNoStore", err)
	}
	r := redisfixture.New(t)
	if err := NewStore(r.Handle).Available(); err != nil {
		t.Fatalf("a connected store should be available: %v", err)
	}
}

// The counterpart to the quiet sweeps: an operation that is asked to do
// something reports the missing connection rather than a silent success.
func TestOperationsReportAMissingConnection(t *testing.T) {
	ctx := context.Background()
	s := NewStore(eipredis.NewRedis(nil))

	for name, call := range map[string]func() error{
		"refresh token read":   func() error { _, _, err := s.RefreshToken(ctx, "tok"); return err },
		"refresh token revoke": func() error { return s.DeleteRefreshToken(ctx, "tok") },
		"grants repair":        func() error { _, err := s.RepairGrants(ctx, true); return err },
		"put session":          func() error { return s.PutSession(ctx, "acct", Session{SessionID: "sess"}) },
		"touch":                func() error { return s.Touch(ctx, "acct", "sess", "") },
		"set grants":           func() error { return s.SetGrants(ctx, "acct", nil) },
	} {
		if err := call(); err == nil {
			t.Errorf("%s with no connection reported success", name)
		}
	}
}

// The index holds one token while a session can have outlived several, so a
// logout that stopped at the indexed one would leave the session usable through
// a token nothing is tracking.
func TestRevokeSessionTokensReachesTokensNoIndexNames(t *testing.T) {
	ctx := context.Background()
	r := redisfixture.New(t)
	s := NewStore(r.Handle)

	for _, token := range []string{"presented", "a", "b"} {
		if err := s.PutRefreshToken(ctx, token, RefreshTokenData{SessionID: "sess"}); err != nil {
			t.Fatalf("put %s: %v", token, err)
		}
	}
	if err := s.RevokeSessionTokens(ctx, "presented", "sess"); err != nil {
		t.Fatalf("revoke: %v", err)
	}

	for _, token := range []string{"presented", "a", "b"} {
		if _, found, _ := s.RefreshToken(ctx, token); found {
			t.Errorf("token %q survived the revoke", token)
		}
	}
}

// These mint the credentials a planner session is identified by, so distinctness
// is the property that matters — a repeat would hand two browsers the same
// session.
func TestGeneratedIdentifiersAreDistinct(t *testing.T) {
	seen := map[string]bool{}
	for range 100 {
		for name, generate := range map[string]func() (string, error){
			"refresh token": GenerateRefreshToken,
			"session id":    GenerateSessionID,
		} {
			got, err := generate()
			if err != nil {
				t.Fatalf("%s: %v", name, err)
			}
			if got == "" {
				t.Fatalf("%s returned an empty value", name)
			}
			if seen[got] {
				t.Fatalf("%s repeated %q", name, got)
			}
			seen[got] = true
		}
	}
}

// A caller's mutation is re-applied on every compare-and-set attempt, so a
// counter it keeps outside itself has to be re-derived per call rather than
// added to. Getting that wrong reports work an attempt did not commit.
//
// The conflict is forced through miniredis directly rather than from another
// goroutine: a direct write bumps the watched key's version without going
// through the watched connection, so the retry happens on every run instead of
// whenever the timing allows.
func TestUpdateAccountRecordRerunsTheMutationOnAConflict(t *testing.T) {
	ctx := context.Background()
	r := redisfixture.New(t)
	s := NewStore(r.Handle)

	calls := 0
	counted := 0
	err := s.UpdateAccountRecord(ctx, "acct", func(rec *AccountRecord) error {
		calls++
		counted = 0
		if calls == 1 {
			if err := r.Server.Set(accountKey("acct"), `{"account_id":"acct","sessions":{}}`); err != nil {
				t.Fatalf("racing write: %v", err)
			}
		}
		rec.Sessions["sess"] = Session{SessionID: "sess"}
		counted++
		return nil
	})
	if err != nil {
		t.Fatalf("update: %v", err)
	}

	if calls < 2 {
		t.Fatalf("mutation ran %d times; the racing write should have cost it an attempt", calls)
	}
	if counted != 1 {
		t.Fatalf("counted = %d, want 1 — what a caller keeps outside the mutation must be re-derived per attempt", counted)
	}
}
