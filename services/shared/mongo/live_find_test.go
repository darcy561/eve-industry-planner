package mongo_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"eve-industry-planner/shared/models"
	"eve-industry-planner/testing/mongolive"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

const (
	findScratchAccount      = "eip-parity-find"
	findOtherScratchAccount = "eip-parity-find-other"
)

func TestLive_findAll_readsEveryGroupAnOwnerHoldsAndNoOtherOwners(t *testing.T) {
	m := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	mongolive.ScratchAccount(t, m, findScratchAccount)
	mongolive.ScratchAccount(t, m, findOtherScratchAccount)
	owner := models.AccountOwner(findScratchAccount)
	other := models.AccountOwner(findOtherScratchAccount)

	now := time.Now().UTC()
	for _, write := range []struct {
		owner models.Owner
		ids   []string
	}{{owner, []string{"group-a", "group-b"}}, {other, []string{"group-c"}}} {
		groups := make([]models.Group, 0, len(write.ids))
		for _, id := range write.ids {
			groups = append(groups, models.Group{GroupID: id, GroupName: id})
		}
		if _, err := m.Groups.BulkUpsertGroups(ctx, write.owner, write.owner.ID, groups, now, "", ""); err != nil {
			t.Fatalf("seed groups: %v", err)
		}
	}

	got, err := m.Groups.LoadGroupsForOwner(ctx, owner)

	if err != nil {
		t.Fatalf("LoadGroupsForOwner: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("got %d groups, want the owner's two and none of the other owner's: %+v", len(got), got)
	}
	if empty, err := m.Groups.LoadGroupsForOwner(ctx, models.AccountOwner("eip-parity-find-nobody")); err != nil || len(empty) != 0 {
		t.Errorf("an owner with no groups answered %v, %v", empty, err)
	}
}

func TestLive_findOne_readsOneGroupAndAnswersNoDocumentsForAMissingOne(t *testing.T) {
	m := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	mongolive.ScratchAccount(t, m, findScratchAccount)
	owner := models.AccountOwner(findScratchAccount)
	if _, err := m.Groups.BulkUpsertGroups(ctx, owner, owner.ID,
		[]models.Group{{GroupID: "group-a", GroupName: "Rifters"}}, time.Now().UTC(), "", ""); err != nil {
		t.Fatalf("seed group: %v", err)
	}

	got, err := m.Groups.LoadGroupByID(ctx, owner, "group-a")
	if err != nil || got.GroupName != "Rifters" {
		t.Fatalf("LoadGroupByID = %+v, %v", got, err)
	}
	if _, err := m.Groups.LoadGroupByID(ctx, owner, "group-missing"); !errors.Is(err, mongo.ErrNoDocuments) {
		t.Errorf("a missing group answered %v, want mongo.ErrNoDocuments", err)
	}
}

func TestLive_findOne_readsTheAccountsWatchlistDocument(t *testing.T) {
	m := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	mongolive.ScratchAccount(t, m, findScratchAccount)
	if _, err := m.WatchlistDeprecated.UpsertWatchlistDeprecated(ctx, findScratchAccount,
		bson.A{}, bson.A{bson.M{"typeID": 34}}, time.Now().UTC(), "sess-1", "client-1"); err != nil {
		t.Fatalf("seed watchlist: %v", err)
	}

	got, err := m.WatchlistDeprecated.LoadWatchlistDeprecated(ctx, findScratchAccount)

	if err != nil {
		t.Fatalf("LoadWatchlistDeprecated: %v", err)
	}
	meta, _ := got["_meta"].(bson.M)
	if meta["sessionID"] != "sess-1" || meta["clientID"] != "client-1" {
		t.Errorf("_meta = %v, want the session and client the save named", meta)
	}
}
