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

// accountPlannerCollections is everything the planner steps write: EnsurePlanner
// inserts the planner, its membership row and its settings, and
// backfillPlannerExtrasCategories changes the settings afterwards.
//
// They are copied before the release like every other collection it writes to.
// A collection that holds nothing when the copy is taken is recorded as empty,
// and that record is what makes revertRelease drop it rather than leave the
// documents the release created standing.
var accountPlannerCollections = []string{
	eipmongo.CollectionPlanners,
	eipmongo.CollectionPlannerMemberships,
	eipmongo.CollectionPlannerSettings,
}

// backfillAccountPlanners gives every existing account the planner it works in,
// and every planner the settings its work is done under.
//
// The write itself is Mongo.EnsureAccountPlanner, which first login also calls:
// one implementation, so an account created after this step runs gets the same
// documents rather than a second version of them.
//
// Only new documents are written, which is what lets this run either side of
// traffic returning, and a repeat run adds nothing.
func backfillAccountPlanners(ctx context.Context, clients *stackservices.Clients, dryRun bool) (string, error) {
	mongo := clients.Mongo

	accountIDs, err := mongo.Users.DistinctStrings(ctx, "_id", bson.M{})
	if err != nil {
		return "", fmt.Errorf("list accounts: %w", err)
	}
	if len(accountIDs) == 0 {
		return "no accounts", nil
	}

	// One read of the planner ids that exist, rather than a count per account: the
	// step runs against every account in the database, and the report below is the
	// only reason it needs to know which are missing at all.
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
			// Named rather than skipped: an account whose id yields no owner holds
			// documents nothing can address either.
			return "", fmt.Errorf("account id %q yields no owner", accountID)
		}
		if _, held := existing[owner.Key()]; !held {
			missing = append(missing, accountID)
		}
	}

	// Every account is visited, not only those missing a planner: an account whose
	// planner predates its settings document has one and needs the other, and each
	// write is insert-only, so visiting one that is already complete costs a no-op
	// rather than an overwrite. `missing` is only what the report names.
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
