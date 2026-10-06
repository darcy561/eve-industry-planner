package commands

import (
	"context"
	"fmt"
	"time"

	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"
	"eve-industry-planner/shared/stackservices"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// accountPlannerCollections is everything the planner steps write, copied before the release so a
// revert drops what the release created.
var accountPlannerCollections = []string{
	eipmongo.CollectionPlanners,
	eipmongo.CollectionPlannerMemberships,
	eipmongo.CollectionPlannerSettings,
}

// backfillAccountPlanners gives every existing account the planner it works in and that planner's
// settings, through the same insert-only write first login uses.
func backfillAccountPlanners(ctx context.Context, clients *stackservices.Clients, dryRun bool) (string, error) {
	mongo := clients.Mongo

	accountIDs, err := mongo.Users.DistinctStrings(ctx, "_id", bson.M{})
	if err != nil {
		return "", fmt.Errorf("list accounts: %w", err)
	}
	if len(accountIDs) == 0 {
		return "no accounts", nil
	}

	existingIDs, err := mongo.Planners.DistinctStrings(ctx, "_id", bson.M{})
	if err != nil {
		return "", fmt.Errorf("list planners: %w", err)
	}
	existing := make(map[string]struct{}, len(existingIDs))
	for _, id := range existingIDs {
		existing[id] = struct{}{}
	}

	missing := make([]string, 0, len(accountIDs))
	for _, accountID := range accountIDs {
		owner := models.AccountOwner(accountID)
		if owner.IsZero() {
			return "", fmt.Errorf("account id %q yields no owner", accountID)
		}
		if _, held := existing[owner.Key()]; !held {
			missing = append(missing, accountID)
		}
	}

	if dryRun {
		return fmt.Sprintf("%d account(s) would be ensured, %d of which have no planner",
			len(accountIDs), len(missing)), nil
	}

	now := time.Now().UTC()
	for _, accountID := range accountIDs {
		if err := mongo.EnsureAccountPlanner(ctx, accountID, now); err != nil {
			return "", err
		}
	}
	return fmt.Sprintf("%d account(s) ensured, %d of which had no planner",
		len(accountIDs), len(missing)), nil
}
