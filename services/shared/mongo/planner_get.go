package mongo

import (
	"context"
	"errors"
	"fmt"

	"eve-industry-planner/shared/documentschema"
	"eve-industry-planner/shared/models"
	"eve-industry-planner/shared/models/planner"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

// OwnerKeysForAccount returns every owner the account holds a membership for, which is what a
// session may reach.
func (m *Mongo) OwnerKeysForAccount(ctx context.Context, accountID string) (models.OwnerKeys, error) {
	if m == nil || accountID == "" {
		return nil, fmt.Errorf("OwnerKeysForAccount: invalid arguments")
	}
	plannerIDs, err := m.PlannerMemberships.DistinctStrings(ctx, "plannerID",
		bson.M{"accountID": accountID})
	if err != nil {
		return nil, fmt.Errorf("list memberships for %s: %w", accountID, err)
	}

	keys := make(models.OwnerKeys, 0, len(plannerIDs))
	for _, plannerID := range plannerIDs {
		if _, err := models.ParseOwnerKey(plannerID); err != nil {
			continue
		}
		keys = append(keys, plannerID)
	}
	return keys.Normalized(), nil
}

// AccountMayReach reports whether the account holds a membership for the owner.
func (m *Mongo) AccountMayReach(ctx context.Context, accountID string, owner models.Owner) (bool, error) {
	if accountID == "" {
		return false, fmt.Errorf("AccountMayReach: invalid arguments")
	}
	if owner.IsZero() {
		return false, nil
	}
	if owner == models.AccountOwner(accountID) {
		return true, nil
	}
	if m == nil {
		return false, fmt.Errorf("AccountMayReach: no mongo handle")
	}
	held, err := m.PlannerMemberships.Collection().CountDocuments(ctx,
		bson.M{"_id": planner.MembershipID(owner.Key(), accountID)})
	if err != nil {
		return false, fmt.Errorf("read membership for %s: %w", accountID, err)
	}
	return held > 0, nil
}

// LoadPlannerSettings reads the settings a planner's work is done under.
func (m *Mongo) LoadPlannerSettings(ctx context.Context, owner models.Owner) (planner.Settings, bool, error) {
	if m == nil || owner.IsZero() {
		return planner.Settings{}, false, fmt.Errorf("LoadPlannerSettings: invalid arguments")
	}

	doc, err := findOne[planner.Settings](ctx, m.PlannerSettings, "LoadPlannerSettings", bson.M{"_id": owner.Key()})
	if errors.Is(err, mongo.ErrNoDocuments) {
		return planner.Settings{}, false, nil
	}
	if err != nil {
		return planner.Settings{}, false, fmt.Errorf("read settings for %s: %w", owner.Key(), err)
	}

	documentschema.Upgrader{}.PlannerSettings(&doc)
	return doc, true, nil
}

// LoadPlanner reads one planner. A planner with no document reports
// [mongo.ErrNoDocuments], which a caller distinguishes from a read failure.
func (m *Mongo) LoadPlanner(ctx context.Context, owner models.Owner) (planner.Planner, error) {
	if m == nil || owner.IsZero() {
		return planner.Planner{}, fmt.Errorf("LoadPlanner: invalid arguments")
	}
	return findOne[planner.Planner](ctx, m.Planners, "LoadPlanner", bson.M{"_id": owner.Key()})
}
