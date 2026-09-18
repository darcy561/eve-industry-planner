package planners

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"eve-industry-planner/api/apideps"
	"eve-industry-planner/api/helper"
	"eve-industry-planner/shared/models"
	"eve-industry-planner/shared/models/planner"
	eipmongo "eve-industry-planner/shared/mongo"
	"eve-industry-planner/shared/plannersession"
	sessionreq "eve-industry-planner/shared/plannersession/request"
	eipredis "eve-industry-planner/shared/redis"
	"eve-industry-planner/testing/mongolive"
	"eve-industry-planner/testing/redisfake"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// The invite routes end to end: a creator issues one, a second account redeems
// it, and the membership row that admits them is the one the planner reads back.
// Requires EIP_MONGO_PARITY_LIVE=1.

const (
	inviteOwnerAccount  = "eip-parity-invite-owner"
	inviteJoinerAccount = "eip-parity-invite-joiner"
	inviteThirdAccount  = "eip-parity-invite-third"
)

func inviteHandlers(t *testing.T, mongo *eipmongo.Mongo) *Handlers {
	t.Helper()
	return New(&apideps.Deps{
		Mongo: mongo,
		Redis: eipredis.NewRedis(redisfake.New(t).Client),
	})
}

// A request as the private mux delivers one: a session, and a body if there is
// one to send.
func asAccountJSON(t *testing.T, accountID, method, path string, body any) *http.Request {
	t.Helper()
	var r *http.Request
	if body == nil {
		r = httptest.NewRequest(method, path, nil)
	} else {
		encoded, err := json.Marshal(body)
		if err != nil {
			t.Fatalf("encode body: %v", err)
		}
		r = httptest.NewRequest(method, path, bytes.NewReader(encoded))
		r.Header.Set("Content-Type", "application/json")
	}
	return r.WithContext(sessionreq.WithIdentity(r.Context(), accountID, "sess-invite"))
}

// seedInvitePlanner writes a custom planner with accountID as its creator. It is
// the one kind that admits by invite: an account planner holds the single member
// it was created for, and an entity planner's roster follows the entity.
func seedInvitePlanner(t *testing.T, mongo *eipmongo.Mongo, accountID string) models.Owner {
	t.Helper()
	owner := models.PlannerOwner("eip-parity-invite-planner")
	cleanupInvitePlanner(t, mongo, owner.Key())

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if _, err := mongo.EnsurePlanner(ctx, owner, eipmongo.PlannerWrite{
		Name: "Shared", CreatedBy: accountID, Member: true,
	}, time.Now().UTC()); err != nil {
		t.Fatalf("seed planner for %s: %v", accountID, err)
	}
	return owner
}

func cleanupInvitePlanner(t *testing.T, mongo *eipmongo.Mongo, plannerID string) {
	t.Helper()
	drop := func() {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		_, _ = mongo.Planners.Collection().DeleteMany(ctx, bson.M{"_id": plannerID})
		_, _ = mongo.PlannerMemberships.Collection().DeleteMany(ctx, bson.M{"plannerID": plannerID})
		_, _ = mongo.PlannerSettings.Collection().DeleteMany(ctx, bson.M{"_id": plannerID})
	}
	drop()
	t.Cleanup(drop)
}

// issueInvite runs the create handler and returns what a creator would be shown.
func issueInvite(t *testing.T, h *Handlers, accountID, handle string, body any) issueInviteResponse {
	t.Helper()
	w := httptest.NewRecorder()
	h.PostPlannerInviteHandler(w, asAccountJSON(t, accountID, http.MethodPost,
		"/api/v1/planners/"+handle+"/invites", body), handle)
	if w.Code != http.StatusCreated {
		t.Fatalf("issue = %d, want 201: %s", w.Code, w.Body.String())
	}
	var got issueInviteResponse
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
		t.Fatalf("decode issue: %v", err)
	}
	return got
}

func TestLive_invite_isIssuedRedeemedAndAdmits(t *testing.T) {
	mongo := mongolive.Require(t)
	h := inviteHandlers(t, mongo)
	owner := seedInvitePlanner(t, mongo, inviteOwnerAccount)
	handle := owner.Key()

	issued := issueInvite(t, h, inviteOwnerAccount, handle, nil)
	if issued.Token == "" {
		t.Fatal("the creator was shown no token")
	}
	if issued.Invite.ID == "" {
		t.Fatal("the invite has no id to redeem")
	}

	// The token is shown here and nowhere else: a listing must not repeat it.
	w := httptest.NewRecorder()
	h.GetPlannerInvitesHandler(w, asAccountJSON(t, inviteOwnerAccount, http.MethodGet,
		"/api/v1/planners/"+handle+"/invites", nil), handle)
	if w.Code != http.StatusOK {
		t.Fatalf("list = %d, want 200: %s", w.Code, w.Body.String())
	}
	if body := w.Body.String(); containsAny(body, issued.Token, "tokenHash", inviteOwnerAccount) {
		t.Fatalf("the listing discloses a secret: %s", body)
	}

	// A second account redeems it and is admitted.
	w = httptest.NewRecorder()
	h.PostPlannerJoinHandler(w, asAccountJSON(t, inviteJoinerAccount, http.MethodPost,
		"/api/v1/planners/join", joinRequest{InviteID: issued.Invite.ID, Token: issued.Token}))
	if w.Code != http.StatusCreated {
		t.Fatalf("join = %d, want 201: %s", w.Code, w.Body.String())
	}
	var joined joinResponse
	if err := json.Unmarshal(w.Body.Bytes(), &joined); err != nil {
		t.Fatalf("decode join: %v", err)
	}
	if !joined.Joined {
		t.Fatal("the join reports it admitted nobody")
	}

	// The row is what grants, so the joiner now reaches the planner.
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	mayReach, err := mongo.AccountMayReach(ctx, inviteJoinerAccount, owner)
	if err != nil {
		t.Fatalf("membership: %v", err)
	}
	if !mayReach {
		t.Fatal("the joiner holds no membership after joining")
	}
}

// A one-use invite admits one account. The second is refused, and told nothing
// about why beyond that it is spent.
func TestLive_invite_admitsOnlyAsManyAsItAllows(t *testing.T) {
	mongo := mongolive.Require(t)
	h := inviteHandlers(t, mongo)
	owner := seedInvitePlanner(t, mongo, inviteOwnerAccount)
	handle := owner.Key()

	issued := issueInvite(t, h, inviteOwnerAccount, handle, nil)

	for _, account := range []string{inviteJoinerAccount, inviteThirdAccount} {
		w := httptest.NewRecorder()
		h.PostPlannerJoinHandler(w, asAccountJSON(t, account, http.MethodPost,
			"/api/v1/planners/join", joinRequest{InviteID: issued.Invite.ID, Token: issued.Token}))
		if account == inviteJoinerAccount && w.Code != http.StatusCreated {
			t.Fatalf("first join = %d, want 201: %s", w.Code, w.Body.String())
		}
		if account == inviteThirdAccount && w.Code != http.StatusGone {
			t.Fatalf("second join = %d, want 410 for a spent invite: %s", w.Code, w.Body.String())
		}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	mayReach, err := mongo.AccountMayReach(ctx, inviteThirdAccount, owner)
	if err != nil {
		t.Fatalf("membership: %v", err)
	}
	if mayReach {
		t.Fatal("a refused account was admitted anyway")
	}
}

// A revoked invite stops working immediately, which is the whole of what
// revocation promises.
func TestLive_invite_stopsWorkingWhenRevoked(t *testing.T) {
	mongo := mongolive.Require(t)
	h := inviteHandlers(t, mongo)
	owner := seedInvitePlanner(t, mongo, inviteOwnerAccount)
	handle := owner.Key()

	issued := issueInvite(t, h, inviteOwnerAccount, handle, nil)

	w := httptest.NewRecorder()
	h.DeletePlannerInviteHandler(w, asAccountJSON(t, inviteOwnerAccount, http.MethodDelete,
		"/api/v1/planners/"+handle+"/invites/"+issued.Invite.ID, nil), handle, issued.Invite.ID)
	if w.Code != http.StatusNoContent {
		t.Fatalf("revoke = %d, want 204: %s", w.Code, w.Body.String())
	}

	w = httptest.NewRecorder()
	h.PostPlannerJoinHandler(w, asAccountJSON(t, inviteJoinerAccount, http.MethodPost,
		"/api/v1/planners/join", joinRequest{InviteID: issued.Invite.ID, Token: issued.Token}))
	if w.Code != http.StatusNotFound {
		t.Fatalf("join after revoke = %d, want 404: %s", w.Code, w.Body.String())
	}
}

// Only the account that created a planner may invite into it. A member who did
// not is refused as though the route were not theirs.
func TestLive_invite_refusesAMemberWhoDidNotCreateThePlanner(t *testing.T) {
	mongo := mongolive.Require(t)
	h := inviteHandlers(t, mongo)
	owner := seedInvitePlanner(t, mongo, inviteOwnerAccount)
	handle := owner.Key()

	issued := issueInvite(t, h, inviteOwnerAccount, handle, nil)
	w := httptest.NewRecorder()
	h.PostPlannerJoinHandler(w, asAccountJSON(t, inviteJoinerAccount, http.MethodPost,
		"/api/v1/planners/join", joinRequest{InviteID: issued.Invite.ID, Token: issued.Token}))
	if w.Code != http.StatusCreated {
		t.Fatalf("join = %d, want 201: %s", w.Code, w.Body.String())
	}

	// The joiner is a member now, and still may not invite or list.
	for _, call := range []struct {
		name string
		run  func(w *httptest.ResponseRecorder)
	}{
		{"issue", func(w *httptest.ResponseRecorder) {
			h.PostPlannerInviteHandler(w, asAccountJSON(t, inviteJoinerAccount, http.MethodPost,
				"/api/v1/planners/"+handle+"/invites", nil), handle)
		}},
		{"list", func(w *httptest.ResponseRecorder) {
			h.GetPlannerInvitesHandler(w, asAccountJSON(t, inviteJoinerAccount, http.MethodGet,
				"/api/v1/planners/"+handle+"/invites", nil), handle)
		}},
		{"revoke", func(w *httptest.ResponseRecorder) {
			h.DeletePlannerInviteHandler(w, asAccountJSON(t, inviteJoinerAccount, http.MethodDelete,
				"/api/v1/planners/"+handle+"/invites/"+issued.Invite.ID, nil), handle, issued.Invite.ID)
		}},
	} {
		w := httptest.NewRecorder()
		call.run(w)
		if w.Code != http.StatusNotFound {
			t.Errorf("%s by a member who did not create the planner = %d, want 404", call.name, w.Code)
		}
	}
}

// A stranger holds no membership row, so the guard every planner route runs
// refuses them before the creator check is reached.
func TestLive_invite_refusesAnAccountWithNoMembership(t *testing.T) {
	mongo := mongolive.Require(t)
	h := inviteHandlers(t, mongo)
	owner := seedInvitePlanner(t, mongo, inviteOwnerAccount)
	handle := owner.Key()

	w := httptest.NewRecorder()
	h.GetPlannerInvitesHandler(w, asAccountJSON(t, inviteThirdAccount, http.MethodGet,
		"/api/v1/planners/"+handle+"/invites", nil), handle)
	if w.Code != http.StatusNotFound {
		t.Fatalf("list by a stranger = %d, want 404", w.Code)
	}
}

// An invite bound to one account admits that account and nobody else, whatever
// the holder of the link presents it as.
func TestLive_invite_boundToAnAccountAdmitsOnlyIt(t *testing.T) {
	mongo := mongolive.Require(t)
	h := inviteHandlers(t, mongo)
	owner := seedInvitePlanner(t, mongo, inviteOwnerAccount)
	handle := owner.Key()

	issued := issueInvite(t, h, inviteOwnerAccount, handle,
		issueInviteRequest{BoundAccountID: inviteJoinerAccount})

	w := httptest.NewRecorder()
	h.PostPlannerJoinHandler(w, asAccountJSON(t, inviteThirdAccount, http.MethodPost,
		"/api/v1/planners/join", joinRequest{InviteID: issued.Invite.ID, Token: issued.Token}))
	if w.Code != http.StatusNotFound {
		t.Fatalf("join by the wrong account = %d, want 404", w.Code)
	}

	w = httptest.NewRecorder()
	h.PostPlannerJoinHandler(w, asAccountJSON(t, inviteJoinerAccount, http.MethodPost,
		"/api/v1/planners/join", joinRequest{InviteID: issued.Invite.ID, Token: issued.Token}))
	if w.Code != http.StatusCreated {
		t.Fatalf("join by the bound account = %d, want 201: %s", w.Code, w.Body.String())
	}
}

// Redeeming again for a planner the account is already in reports that rather
// than writing a second row, and answers 200 rather than 201.
func TestLive_invite_saysNothingChangedForAMemberAlready(t *testing.T) {
	mongo := mongolive.Require(t)
	h := inviteHandlers(t, mongo)
	owner := seedInvitePlanner(t, mongo, inviteOwnerAccount)
	handle := owner.Key()

	issued := issueInvite(t, h, inviteOwnerAccount, handle, issueInviteRequest{MaxUses: 2})

	for i, wantStatus := range []int{http.StatusCreated, http.StatusOK} {
		w := httptest.NewRecorder()
		h.PostPlannerJoinHandler(w, asAccountJSON(t, inviteJoinerAccount, http.MethodPost,
			"/api/v1/planners/join", joinRequest{InviteID: issued.Invite.ID, Token: issued.Token}))
		if w.Code != wantStatus {
			t.Fatalf("join %d = %d, want %d: %s", i+1, w.Code, wantStatus, w.Body.String())
		}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	rows, err := mongo.PlannerMemberships.Collection().CountDocuments(ctx,
		bson.M{"plannerID": handle, "accountID": inviteJoinerAccount})
	if err != nil {
		t.Fatalf("count rows: %v", err)
	}
	if rows != 1 {
		t.Fatalf("%d membership rows, want exactly one", rows)
	}
}

// A wrong token is refused the same way a missing invite is, and spends nothing.
func TestLive_invite_refusesAWrongTokenWithoutSpendingIt(t *testing.T) {
	mongo := mongolive.Require(t)
	h := inviteHandlers(t, mongo)
	owner := seedInvitePlanner(t, mongo, inviteOwnerAccount)
	handle := owner.Key()

	issued := issueInvite(t, h, inviteOwnerAccount, handle, nil)
	wrong, _, err := planner.NewInviteToken()
	if err != nil {
		t.Fatalf("token: %v", err)
	}

	w := httptest.NewRecorder()
	h.PostPlannerJoinHandler(w, asAccountJSON(t, inviteJoinerAccount, http.MethodPost,
		"/api/v1/planners/join", joinRequest{InviteID: issued.Invite.ID, Token: wrong}))
	if w.Code != http.StatusNotFound {
		t.Fatalf("join with a wrong token = %d, want 404", w.Code)
	}

	// The right token still works, so nothing was consumed.
	w = httptest.NewRecorder()
	h.PostPlannerJoinHandler(w, asAccountJSON(t, inviteJoinerAccount, http.MethodPost,
		"/api/v1/planners/join", joinRequest{InviteID: issued.Invite.ID, Token: issued.Token}))
	if w.Code != http.StatusCreated {
		t.Fatalf("join with the right token = %d, want 201: %s", w.Code, w.Body.String())
	}
}

// An invite lasting longer than the cap is refused rather than quietly clamped:
// a creator who asked for a year should be told they cannot have one.
func TestLive_invite_refusesALifetimePastTheCap(t *testing.T) {
	mongo := mongolive.Require(t)
	h := inviteHandlers(t, mongo)
	owner := seedInvitePlanner(t, mongo, inviteOwnerAccount)
	handle := owner.Key()

	w := httptest.NewRecorder()
	h.PostPlannerInviteHandler(w, asAccountJSON(t, inviteOwnerAccount, http.MethodPost,
		"/api/v1/planners/"+handle+"/invites",
		issueInviteRequest{ExpiresInHours: int(planner.MaxInviteLifetime/time.Hour) + 1}), handle)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("issue past the lifetime cap = %d, want 400", w.Code)
	}
}

// The header every other scoped route reads is not what names the planner here:
// the path does, so a header naming another planner changes nothing.
func TestLive_invite_readsThePlannerFromThePathNotTheHeader(t *testing.T) {
	mongo := mongolive.Require(t)
	h := inviteHandlers(t, mongo)
	owner := seedInvitePlanner(t, mongo, inviteOwnerAccount)
	handle := owner.Key()

	issued := issueInvite(t, h, inviteOwnerAccount, handle, nil)

	r := asAccountJSON(t, inviteOwnerAccount, http.MethodGet,
		"/api/v1/planners/"+handle+"/invites", nil)
	r.Header.Set(helper.PlannerOwnerHeader, "account:"+inviteThirdAccount)

	w := httptest.NewRecorder()
	h.GetPlannerInvitesHandler(w, r, handle)
	if w.Code != http.StatusOK {
		t.Fatalf("list = %d, want 200: %s", w.Code, w.Body.String())
	}
	var got listInvitesResponse
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(got.Invites) != 1 || got.Invites[0].ID != issued.Invite.ID {
		t.Fatalf("listing = %v, want the invite issued for the planner in the path", got.Invites)
	}
}

func containsAny(haystack string, needles ...string) bool {
	for _, needle := range needles {
		if needle != "" && bytes.Contains([]byte(haystack), []byte(needle)) {
			return true
		}
	}
	return false
}

// An account planner holds the one member it was created for, so it takes no
// invites even from its own account. Requires EIP_MONGO_PARITY_LIVE=1.
func TestLive_invite_refusesAnAccountPlanner(t *testing.T) {
	mongo := mongolive.Require(t)
	h := inviteHandlers(t, mongo)

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	owner := models.AccountOwner(inviteOwnerAccount)
	cleanupInvitePlanner(t, mongo, owner.Key())
	if err := mongo.EnsureAccountPlanner(ctx, inviteOwnerAccount, time.Now().UTC()); err != nil {
		t.Fatalf("seed account planner: %v", err)
	}
	handle := owner.Key()

	w := httptest.NewRecorder()
	h.PostPlannerInviteHandler(w, asAccountJSON(t, inviteOwnerAccount, http.MethodPost,
		"/api/v1/planners/"+handle+"/invites", nil), handle)
	if w.Code != http.StatusConflict {
		t.Fatalf("issue for an account planner = %d, want 409: %s", w.Code, w.Body.String())
	}

	// Nothing was stored, so nothing is outstanding to redeem.
	pending, err := h.invites().Pending(ctx, handle, time.Now().UTC())
	if err != nil {
		t.Fatalf("pending: %v", err)
	}
	if len(pending) != 0 {
		t.Fatalf("%d invites stored for a planner that takes none", len(pending))
	}
}

// Joining rewrites the grants the join made true.
//
// The row is what authorises, but every scoped surface reads the ceiling on the
// session record — so a join that wrote the row alone would admit a member who
// then reaches nothing until some unrelated task derives their grants again.
func TestLive_invite_joiningRewritesTheStoredGrants(t *testing.T) {
	mongo := mongolive.Require(t)
	h := inviteHandlers(t, mongo)
	owner := seedInvitePlanner(t, mongo, inviteOwnerAccount)
	handle := owner.Key()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	sessions := plannersession.NewStore(h.Redis)

	issued := issueInvite(t, h, inviteOwnerAccount, handle, nil)
	w := httptest.NewRecorder()
	h.PostPlannerJoinHandler(w, asAccountJSON(t, inviteThirdAccount, http.MethodPost,
		"/api/v1/planners/join", joinRequest{InviteID: issued.Invite.ID, Token: issued.Token}))
	if w.Code != http.StatusCreated {
		t.Fatalf("join = %d, want 201: %s", w.Code, w.Body.String())
	}

	record, found, err := sessions.AccountRecord(ctx, inviteThirdAccount)
	if err != nil {
		t.Fatalf("read account record: %v", err)
	}
	if !found {
		t.Fatal("joining wrote no account record to carry the grants")
	}
	if !record.Grants.OwnerKeys.Has(owner) {
		t.Fatalf("grants = %v, want the planner just joined", record.Grants.OwnerKeys)
	}
}
