package commands

import (
	"context"
	"fmt"
	"time"

	"eve-industry-planner/shared/documentschema"
	"eve-industry-planner/shared/models"
	"eve-industry-planner/shared/stackservices"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// seedPricingDefaults writes each account's buying and selling defaults from the
// single market and order type it held before the two sides were told apart.
//
// The same seed runs on every read of an account's settings and nothing persists
// it: LoadApplicationSettings writes back only when the schema version moved, and
// this seed is gated on an empty market instead — an unversioned document is
// stamped with the current version before the seed is reached, so a version test
// would never fire for exactly the rows that need filling. The read path
// therefore fills the field for its caller and leaves the document as it was,
// every time. This is the step that makes it stick.
//
// The seed itself is documentschema's rather than a copy of it. A second
// implementation of these rules could disagree with the one every read goes
// through, and the disagreement would be invisible until a player's default
// changed under them.
func seedPricingDefaults(ctx context.Context, clients *stackservices.Clients, dryRun bool) (string, error) {
	settings := clients.Mongo.ApplicationSettings
	coll := settings.Collection()
	if coll == nil {
		return "", fmt.Errorf("account settings collection unavailable")
	}

	// Absent, null or empty all mean unanswered: a document written before the
	// split has the key missing, and one written after it has the key present and
	// empty, because PricingSide's fields are omitempty.
	unanswered := bson.M{"$in": bson.A{nil, ""}}
	accountIDs, err := settings.DistinctStrings(ctx, "_id", bson.M{"$or": bson.A{
		bson.M{"defaultPricing.buying.market": unanswered},
		bson.M{"defaultPricing.selling.market": unanswered},
		bson.M{"defaultPricing.selling.exit": unanswered},
	}})
	if err != nil {
		return "", fmt.Errorf("find account settings owing a seed: %w", err)
	}
	if len(accountIDs) == 0 {
		return "no account owes a pricing default", nil
	}
	if dryRun {
		return fmt.Sprintf("%d account(s) would be seeded", len(accountIDs)), nil
	}

	now := time.Now().UTC()
	for _, accountID := range accountIDs {
		var doc models.ApplicationSettings
		if err := coll.FindOne(ctx, bson.M{"_id": accountID}).Decode(&doc); err != nil {
			return "", fmt.Errorf("read settings for %s: %w", accountID, err)
		}

		documentschema.Upgrader{}.ApplicationSettings(&doc, accountID, now)

		if _, _, err := settings.UpsertApplicationSettings(ctx, accountID, doc); err != nil {
			return "", fmt.Errorf("persist pricing defaults for %s: %w", accountID, err)
		}
	}

	return fmt.Sprintf("%d account(s) seeded", len(accountIDs)), nil
}
