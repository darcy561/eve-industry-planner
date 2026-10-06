package commands

import (
	"context"
	"errors"
	"fmt"
	"slices"

	"eve-industry-planner/shared/models"
	"eve-industry-planner/shared/models/planner"
	eipmongo "eve-industry-planner/shared/mongo"
	"eve-industry-planner/shared/stackservices"

	"go.mongodb.org/mongo-driver/v2/bson"
	mongodriver "go.mongodb.org/mongo-driver/v2/mongo"
)

// retiredReprocessingFields are the account's reprocessing fields the planner's settings replace.
var retiredReprocessingFields = []string{
	"preferCompressed",
	"sellExcessMineralTypes",
	"compressionBonusMultiplier",
	"valueMultiplier",
	"wastePenaltyMultiplier",
}

// legacyReprocessing is the part of an account's retired reprocessing fields a planner carries on.
type legacyReprocessing struct {
	PreferCompressed       *bool `bson:"preferCompressed"`
	SellExcessMineralTypes *bool `bson:"sellExcessMineralTypes"`
}

// backfillPlannerSettings brings onto each account's planner the planner settings the account holds:
// extras categories merged by id, and reprocessing settings converted from the pre-release copy.
func backfillPlannerSettings(ctx context.Context, clients *stackservices.Clients, dryRun bool) (string, error) {
	source, err := preReleaseAccountSettings(ctx, clients.Mongo, currentRelease, dryRun)
	if err != nil {
		return "", err
	}
	legacy, err := readLegacyReprocessing(ctx, source)
	if err != nil {
		return "", err
	}
	return backfillPlannerSettingsFrom(ctx, clients, legacy, dryRun)
}

// preReleaseAccountSettings is the account settings as they stood before a release wrote to them: its
// copy, or in a dry run, which writes nothing, the collection itself.
func preReleaseAccountSettings(ctx context.Context, m *eipmongo.Mongo, release string, dryRun bool) (*mongodriver.Collection, error) {
	var recorded backupRecord
	err := m.Coll(releaseBackupsCollection).FindOne(ctx,
		bson.M{"_id": backupRecordID(release, eipmongo.CollectionAccountSettings)}).Decode(&recorded)
	switch {
	case err == nil:
		return m.Coll(eipmongo.CollectionAccountSettings + backupSuffix(release)), nil
	case !errors.Is(err, mongodriver.ErrNoDocuments):
		return nil, fmt.Errorf("read the backup record for %s: %w", eipmongo.CollectionAccountSettings, err)
	case dryRun:
		return m.ApplicationSettings.Collection(), nil
	default:
		return nil, fmt.Errorf("%s has no pre-release copy for %s to read", eipmongo.CollectionAccountSettings, release)
	}
}

// readLegacyReprocessing is each account's retired reprocessing fields, for the accounts that hold any.
func readLegacyReprocessing(ctx context.Context, source *mongodriver.Collection) (map[string]legacyReprocessing, error) {
	cursor, err := source.Find(ctx, bson.M{"$or": retiredFieldFilters()})
	if err != nil {
		return nil, fmt.Errorf("read the pre-release reprocessing settings: %w", err)
	}
	defer cursor.Close(ctx)

	legacy := map[string]legacyReprocessing{}
	for cursor.Next(ctx) {
		var doc struct {
			ID                   string             `bson:"_id"`
			ReprocessingSettings legacyReprocessing `bson:"reprocessingSettings"`
		}
		if err := cursor.Decode(&doc); err != nil {
			return nil, fmt.Errorf("decode pre-release reprocessing settings: %w", err)
		}
		legacy[doc.ID] = doc.ReprocessingSettings
	}
	if err := cursor.Err(); err != nil {
		return nil, fmt.Errorf("walk the pre-release reprocessing settings: %w", err)
	}
	return legacy, nil
}

// backfillPlannerSettingsFrom moves the account-held planner settings onto each planner, taking the
// retired reprocessing fields from legacy, and clears those fields from the accounts still holding them.
func backfillPlannerSettingsFrom(ctx context.Context, clients *stackservices.Clients, legacy map[string]legacyReprocessing, dryRun bool) (string, error) {
	cursor, err := clients.Mongo.ApplicationSettings.Collection().Find(ctx, bson.M{}, nil)
	if err != nil {
		return "", fmt.Errorf("read application settings: %w", err)
	}
	defer cursor.Close(ctx)

	planners, categories, reprocessing, unseeded := 0, 0, 0, 0
	for cursor.Next(ctx) {
		var doc struct {
			ID               string                 `bson:"_id"`
			ExtrasCategories []models.ExtraCategory `bson:"extrasCategories"`
		}
		if err := cursor.Decode(&doc); err != nil {
			return "", fmt.Errorf("decode application settings: %w", err)
		}

		owner := models.AccountOwner(doc.ID)
		if owner.IsZero() {
			return "", fmt.Errorf("account id %q yields no owner", doc.ID)
		}
		settings, seeded, err := clients.Mongo.LoadPlannerSettings(ctx, owner)
		if err != nil {
			return "", fmt.Errorf("read planner settings for %s: %w", owner.Key(), err)
		}
		account, holdsLegacy := legacy[doc.ID]
		if !seeded {
			if len(doc.ExtrasCategories) > 0 || holdsLegacy {
				unseeded++
			}
			continue
		}

		set := bson.M{}
		if merged, added := mergeExtrasCategories(settings.ExtrasCategories, doc.ExtrasCategories); added > 0 {
			set["extrasCategories"] = merged
			categories += added
		}
		if converted, change := reprocessingFor(settings.ReprocessingSettings, account, holdsLegacy); change {
			set["reprocessingSettings"] = converted
			reprocessing++
		}
		if len(set) == 0 {
			continue
		}
		planners++
		if dryRun {
			continue
		}
		if _, err := clients.Mongo.PlannerSettings.Collection().UpdateByID(ctx, owner.Key(), bson.M{"$set": set}); err != nil {
			return "", fmt.Errorf("write planner settings for %s: %w", owner.Key(), err)
		}
	}
	if err := cursor.Err(); err != nil {
		return "", fmt.Errorf("walk application settings: %w", err)
	}

	cleared, err := clearRetiredReprocessingFields(ctx, clients.Mongo, dryRun)
	if err != nil {
		return "", err
	}

	verb, clearVerb := "moved onto", "cleared of"
	if dryRun {
		verb, clearVerb = "would move onto", "would be cleared of"
	}
	report := fmt.Sprintf("%d categor(ies) and %d reprocessing setting(s) %s %d planner(s); %d account(s) %s retired reprocessing fields",
		categories, reprocessing, verb, planners, cleared, clearVerb)
	if unseeded > 0 {
		report += fmt.Sprintf(", %d account(s) have no planner settings", unseeded)
	}
	return report, nil
}

// reprocessingFor is the reprocessing settings a planner should hold and whether that changes them:
// a planner's own choice stands, while missing, retired-shape or seeded settings take the account's.
func reprocessingFor(held planner.ReprocessingSettings, account legacyReprocessing, holdsLegacy bool) (planner.ReprocessingSettings, bool) {
	if held.Validate() == nil && !sameReprocessing(held, planner.DefaultReprocessingSettings()) {
		return held, false
	}
	target := planner.DefaultReprocessingSettings()
	if holdsLegacy {
		target = convertLegacyReprocessing(account)
	}
	return target, held.Validate() != nil || !sameReprocessing(held, target)
}

// convertLegacyReprocessing is a planner's reprocessing settings from an account's retired fields:
// preferring compressed ore or only allowing it, and counting leftovers as sold where it sold them.
func convertLegacyReprocessing(account legacyReprocessing) planner.ReprocessingSettings {
	settings := planner.DefaultReprocessingSettings()
	if account.PreferCompressed != nil && !*account.PreferCompressed {
		settings.CompressedOre = planner.CompressedOreAllow
	}
	settings.CountLeftoversAsSold = account.SellExcessMineralTypes != nil && *account.SellExcessMineralTypes
	return settings
}

// sameReprocessing reports whether two planners' reprocessing settings choose and cost ore alike.
func sameReprocessing(a, b planner.ReprocessingSettings) bool {
	return a.CompressedOre == b.CompressedOre && a.CountLeftoversAsSold == b.CountLeftoversAsSold &&
		a.BuyOutright == b.BuyOutright && a.Shipping == b.Shipping && slices.Equal(a.NeverChoose, b.NeverChoose)
}

// clearRetiredReprocessingFields removes the retired reprocessing fields from the accounts that still
// hold them, and reports how many it cleared.
func clearRetiredReprocessingFields(ctx context.Context, m *eipmongo.Mongo, dryRun bool) (int64, error) {
	filter := bson.M{"$or": retiredFieldFilters()}
	if dryRun {
		count, err := m.ApplicationSettings.Collection().CountDocuments(ctx, filter)
		if err != nil {
			return 0, fmt.Errorf("count accounts holding retired reprocessing fields: %w", err)
		}
		return count, nil
	}
	unset := bson.M{}
	for _, field := range retiredReprocessingFields {
		unset["reprocessingSettings."+field] = ""
	}
	result, err := m.ApplicationSettings.Collection().UpdateMany(ctx, filter, bson.M{"$unset": unset})
	if err != nil {
		return 0, fmt.Errorf("clear retired reprocessing fields: %w", err)
	}
	return result.ModifiedCount, nil
}

// retiredFieldFilters matches a settings document holding any retired reprocessing field.
func retiredFieldFilters() []bson.M {
	filters := make([]bson.M, 0, len(retiredReprocessingFields))
	for _, field := range retiredReprocessingFields {
		filters = append(filters, bson.M{"reprocessingSettings." + field: bson.M{"$exists": true}})
	}
	return filters
}

// mergeExtrasCategories adds the categories the planner is missing, to a copy of its list, and reports
// how many it added; a category the planner holds is left as it is.
func mergeExtrasCategories(held, incoming []models.ExtraCategory) ([]models.ExtraCategory, int) {
	merged := slices.Clone(held)
	known := make(map[string]struct{}, len(merged))
	for _, category := range merged {
		known[category.ID] = struct{}{}
	}

	added := 0
	for _, category := range incoming {
		if category.ID == "" {
			continue
		}
		if _, present := known[category.ID]; present {
			continue
		}
		merged = append(merged, category)
		known[category.ID] = struct{}{}
		added++
	}
	return merged, added
}
