package mongo

import (
	"context"
	"errors"
	"testing"
	"time"

	"eve-industry-planner/shared/models"
	"eve-industry-planner/shared/models/planner"
)

func TestJoinRefusesAPlannerThatTakesNoInvites(t *testing.T) {
	t.Parallel()
	var m *Mongo

	for _, owner := range []models.Owner{
		models.AccountOwner("acct-1"),
		{Kind: models.OwnerCorporation, ID: "corp_ref"},
		{Kind: models.OwnerAlliance, ID: "alliance_ref"},
	} {
		_, err := m.JoinPlannerByInvite(context.Background(), owner, "acct-2",
			planner.InviteRedemption{InvitedBy: "acct-1", IssuedAt: time.Now().UTC()},
			time.Now().UTC())
		if !errors.Is(err, ErrKindAdmitsNoInvite) {
			t.Errorf("join into a %s planner = %v, want the refusal", owner.Kind, err)
		}
	}
}

func TestJoinRefusesAZeroOwner(t *testing.T) {
	t.Parallel()
	var m *Mongo

	_, err := m.JoinPlannerByInvite(context.Background(), models.Owner{}, "acct-2",
		planner.InviteRedemption{}, time.Now().UTC())
	if !errors.Is(err, ErrKindAdmitsNoInvite) {
		t.Fatalf("join with no owner = %v, want the refusal", err)
	}
}
