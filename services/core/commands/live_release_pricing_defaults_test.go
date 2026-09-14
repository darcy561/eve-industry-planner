package commands

import (
	"context"
	"testing"
	"time"

	"eve-industry-planner/shared/models"
	"eve-industry-planner/shared/stackservices"
	"eve-industry-planner/testing/mongolive"

	"go.mongodb.org/mongo-driver/v2/bson"
)

const pricingScratchAccount = "eip-parity-pricing-account"

// The seed runs against settings documents in whatever state the database left
// them, and each of these is a state a real account has been in: written before
// the split, written after it with the key present and empty, and written by a
// player who has already answered.
//
// The step takes no scope, so it seeds every account owing a default rather than
// the scratch one alone. That is safe for the same reason the planner backfill
// is: it writes only where a side is unanswered, so an account that has chosen
// is not visited twice.
//
// Requires EIP_MONGO_PARITY_LIVE=1.
func TestLive_seedPricingDefaults_fillsEveryUnansweredSide(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	clients := &stackservices.Clients{Mongo: mongo}
	now := time.Now().UTC()

	states := []struct {
		name   string
		suffix string
		// stored is written over the default document, as the database holds it.
		stored bson.M
		expect func(t *testing.T, got models.ApplicationSettings)
	}{
		{
			// A document from before the split: its only answer is in the legacy
			// pair, and both sides have to be able to read it.
			name:   "the legacy pair and no pricing at all",
			suffix: "-legacy",
			stored: bson.M{
				"$set":   bson.M{"defaultMarketLocation": "amarr", "defaultOrderType": "buy"},
				"$unset": bson.M{"defaultPricing": ""},
			},
			expect: func(t *testing.T, got models.ApplicationSettings) {
				if got.DefaultPricing.Buying.Market != "amarr" {
					t.Errorf("buying market: got %q, want amarr", got.DefaultPricing.Buying.Market)
				}
				if got.DefaultPricing.Buying.Basis != "buy" {
					t.Errorf("buying basis: got %q, want buy", got.DefaultPricing.Buying.Basis)
				}
				if got.DefaultPricing.Selling.Market != "amarr" {
					t.Errorf("selling market: got %q, want amarr", got.DefaultPricing.Selling.Market)
				}
				// The buy side of the book is a sale into bids, which is the
				// immediate route rather than a listing.
				if got.DefaultPricing.Selling.Exit != models.ExitRouteImmediate {
					t.Errorf("selling exit: got %q, want %q",
						got.DefaultPricing.Selling.Exit, models.ExitRouteImmediate)
				}
			},
		},
		{
			// The shape a document written after the split has: the key is there
			// and each side is empty, because PricingSide's fields are omitempty.
			name:   "the key present with both sides empty",
			suffix: "-empty-sides",
			stored: bson.M{"$set": bson.M{
				"defaultMarketLocation": "dodixie",
				"defaultOrderType":      "sell",
				"defaultPricing":        bson.M{"buying": bson.M{}, "selling": bson.M{}},
			}},
			expect: func(t *testing.T, got models.ApplicationSettings) {
				if got.DefaultPricing.Buying.Market != "dodixie" {
					t.Errorf("buying market: got %q, want dodixie", got.DefaultPricing.Buying.Market)
				}
				if got.DefaultPricing.Selling.Exit != models.ExitRouteListed {
					t.Errorf("selling exit: got %q, want %q",
						got.DefaultPricing.Selling.Exit, models.ExitRouteListed)
				}
			},
		},
		{
			// A side may carry a group table before it names a market of its own.
			// Filling the market must not take the table with it — replacing a
			// whole side to fill part of it is the trap this project has already
			// recorded once.
			name:   "a group table on a side that has not named a market",
			suffix: "-groups",
			stored: bson.M{"$set": bson.M{
				"defaultMarketLocation": "jita",
				"defaultOrderType":      "sell",
				"defaultPricing": bson.M{
					"buying":  bson.M{"groups": bson.M{"1857": bson.M{"market": "hek"}}},
					"selling": bson.M{},
				},
			}},
			expect: func(t *testing.T, got models.ApplicationSettings) {
				if got.DefaultPricing.Buying.Market != "jita" {
					t.Errorf("buying market: got %q, want jita", got.DefaultPricing.Buying.Market)
				}
				group, held := got.DefaultPricing.Buying.Groups["1857"]
				if !held {
					t.Fatalf("the group table was lost: %#v", got.DefaultPricing.Buying.Groups)
				}
				if group.Market != "hek" {
					t.Errorf("group market: got %q, want hek", group.Market)
				}
			},
		},
		{
			// A player who has answered keeps their answer, whatever the legacy
			// pair beside it still says.
			name:   "a side the player has already chosen",
			suffix: "-chosen",
			stored: bson.M{"$set": bson.M{
				"defaultMarketLocation": "jita",
				"defaultOrderType":      "sell",
				"defaultPricing": bson.M{
					"buying":  bson.M{"market": "hek", "basis": "buyP95"},
					"selling": bson.M{"market": "rens", "exit": models.ExitRouteImmediate},
				},
			}},
			expect: func(t *testing.T, got models.ApplicationSettings) {
				if got.DefaultPricing.Buying.Market != "hek" {
					t.Errorf("buying market: got %q, want hek", got.DefaultPricing.Buying.Market)
				}
				if got.DefaultPricing.Buying.Basis != "buyP95" {
					t.Errorf("buying basis: got %q, want buyP95", got.DefaultPricing.Buying.Basis)
				}
				if got.DefaultPricing.Selling.Market != "rens" {
					t.Errorf("selling market: got %q, want rens", got.DefaultPricing.Selling.Market)
				}
			},
		},
	}

	for _, state := range states {
		t.Run(state.name, func(t *testing.T) {
			account := pricingScratchAccount + state.suffix
			mongolive.ScratchAccount(t, mongo, account)

			doc := models.DefaultApplicationSettings(account, now)
			if _, _, err := mongo.ApplicationSettings.UpsertApplicationSettings(ctx, account, doc); err != nil {
				t.Fatalf("write the settings document: %v", err)
			}
			if _, err := mongo.ApplicationSettings.Collection().
				UpdateOne(ctx, bson.M{"_id": account}, state.stored); err != nil {
				t.Fatalf("put the document into its stored state: %v", err)
			}

			if _, err := seedPricingDefaults(ctx, clients, false); err != nil {
				t.Fatalf("seedPricingDefaults: %v", err)
			}

			var got models.ApplicationSettings
			if err := mongo.ApplicationSettings.Collection().
				FindOne(ctx, bson.M{"_id": account}).Decode(&got); err != nil {
				t.Fatalf("read the seeded document: %v", err)
			}
			state.expect(t, got)

			// Re-running must find nothing: the step is what an operator re-runs
			// when a release is repeated, and a second pass that moved a value
			// would undo whatever the player had changed in between.
			before := got
			if _, err := seedPricingDefaults(ctx, clients, false); err != nil {
				t.Fatalf("seedPricingDefaults, second run: %v", err)
			}
			if err := mongo.ApplicationSettings.Collection().
				FindOne(ctx, bson.M{"_id": account}).Decode(&got); err != nil {
				t.Fatalf("re-read the seeded document: %v", err)
			}
			if got.DefaultPricing.Buying.PricingChoice != before.DefaultPricing.Buying.PricingChoice ||
				got.DefaultPricing.Selling.PricingChoice != before.DefaultPricing.Selling.PricingChoice ||
				got.DefaultPricing.Selling.Exit != before.DefaultPricing.Selling.Exit {
				t.Errorf("a second run moved the answer: %#v then %#v",
					before.DefaultPricing, got.DefaultPricing)
			}
		})
	}
}
