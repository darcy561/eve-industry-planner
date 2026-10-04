package mongo

import (
	"context"
	"fmt"

	"eve-industry-planner/shared/models"
	"eve-industry-planner/shared/models/planner"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// PlannerListing is one planner an account may work in.
type PlannerListing struct {
	Owner    models.Owner
	Name     string
	Named    bool
	JoinKind planner.JoinKind
}

// PlannersForAccount lists every planner the account holds a membership for.
func (m *Mongo) PlannersForAccount(ctx context.Context, accountID string) ([]PlannerListing, error) {
	if m == nil || accountID == "" {
		return nil, fmt.Errorf("PlannersForAccount: invalid arguments")
	}

	rows, err := findAll[planner.Membership](ctx, m.PlannerMemberships, "PlannersForAccount", bson.M{"accountID": accountID})
	if err != nil {
		return nil, fmt.Errorf("read memberships for %s: %w", accountID, err)
	}
	if len(rows) == 0 {
		return nil, nil
	}

	listings := make([]PlannerListing, 0, len(rows))
	ids := make([]string, 0, len(rows))
	for _, row := range rows {
		owner, err := models.ParseOwnerKey(row.PlannerID)
		if err != nil {
			continue
		}
		listings = append(listings, PlannerListing{
			Owner:    owner,
			JoinKind: row.JoinMethod.Kind(),
		})
		ids = append(ids, row.PlannerID)
	}
	if len(listings) == 0 {
		return nil, nil
	}

	named, err := m.plannersByID(ctx, ids)
	if err != nil {
		return nil, err
	}
	for i := range listings {
		doc, found := named[listings[i].Owner.Key()]
		if !found {
			continue
		}
		listings[i].Name = doc.Name
		listings[i].Named = true
	}
	return listings, nil
}

func (m *Mongo) plannersByID(ctx context.Context, ids []string) (map[string]planner.Planner, error) {
	docs, err := findAll[planner.Planner](ctx, m.Planners, "plannersByID", bson.M{"_id": bson.M{"$in": ids}})
	if err != nil {
		return nil, fmt.Errorf("read planners: %w", err)
	}
	byID := make(map[string]planner.Planner, len(docs))
	for _, doc := range docs {
		byID[doc.ID] = doc
	}
	return byID, nil
}
