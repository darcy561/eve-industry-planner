package mongo

import (
	"context"
	"testing"

	"eve-industry-planner/shared/models"
)

func TestAccountMayReachAnswersItsOwnPlannerWithoutAHandle(t *testing.T) {
	t.Parallel()

	var absent *Mongo
	mayReach, err := absent.AccountMayReach(context.Background(), "acct-1",
		models.AccountOwner("acct-1"))
	if err != nil {
		t.Fatalf("AccountMayReach: %v", err)
	}
	if !mayReach {
		t.Error("an account was refused its own planner")
	}
}

func TestAccountMayReachNeedsAHandleForEveryOtherOwner(t *testing.T) {
	t.Parallel()

	var absent *Mongo
	for _, owner := range []models.Owner{
		models.AccountOwner("someone-else"),
		models.CorporationOwner("corp_56_J_DzQdPpjXwi9Xtp3C8bri9Bfi0Z94qUulkbKCac"),
	} {
		mayReach, err := absent.AccountMayReach(context.Background(), "acct-1", owner)
		if err == nil {
			t.Errorf("%s was answered without a handle", owner.Key())
		}
		if mayReach {
			t.Errorf("%s was granted without a handle", owner.Key())
		}
	}
}

func TestAccountMayReachRefusesTheZeroOwner(t *testing.T) {
	t.Parallel()

	var absent *Mongo
	mayReach, err := absent.AccountMayReach(context.Background(), "acct-1", models.Owner{})
	if err != nil {
		t.Fatalf("AccountMayReach: %v", err)
	}
	if mayReach {
		t.Error("the zero owner was granted")
	}
}
