package commands

import (
	"context"
	"fmt"
	"slices"

	"eve-industry-planner/shared/models"
	"eve-industry-planner/shared/stackservices"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// backfillPlannerExtrasCategories puts the extras categories an account holds
// onto the planner that account works in.
//
// A planner's settings are written the first time its account logs in, seeded
// from the account's settings as they stood then, and the write is insert-only —
// so a category the account added at any later login is on the account document
// and not on the planner. The account's list was the one every picker read until
// the categories became the planner's, which is why the additions are there.
//
// Merged by id, never replaced: a category the planner already holds is left as
// it is, deletions included. That is what makes the step safe to run again once
// members are editing the planner's own list, which a release step has to be.
func backfillPlannerExtrasCategories(ctx context.Context, clients *stackservices.Clients, dryRun bool) (string, error) {
	cursor, err := clients.Mongo.ApplicationSettings.Collection().Find(ctx, bson.M{}, nil)
	if err != nil {
		return "", fmt.Errorf("read application settings: %w", err)
	}
	defer cursor.Close(ctx)

	planners, categories, unseeded := 0, 0, 0
	for cursor.Next(ctx) {
		var doc struct {
			ID               string                 `bson:"_id"`
			ExtrasCategories []models.ExtraCategory `bson:"extrasCategories"`
		}
		if err := cursor.Decode(&doc); err != nil {
			return "", fmt.Errorf("decode application settings: %w", err)
		}
		if len(doc.ExtrasCategories) == 0 {
			continue
		}

		owner := models.AccountOwner(doc.ID)
		if owner.IsZero() {
			return "", fmt.Errorf("account id %q yields no owner", doc.ID)
		}
		settings, seeded, err := clients.Mongo.LoadPlannerSettings(ctx, owner)
		if err != nil {
			return "", fmt.Errorf("read planner settings for %s: %w", owner.Key(), err)
		}
		if !seeded {
			// The step that gives every account its planner runs before this one,
			// so this is an account whose planner could not be written. Counted
			// rather than failed: the release's own gate is what refuses.
			unseeded++
			continue
		}

		merged, added := mergeExtrasCategories(settings.ExtrasCategories, doc.ExtrasCategories)
		if added == 0 {
			continue
		}
		planners++
		categories += added
		if dryRun {
			continue
		}
		if _, err := clients.Mongo.PlannerSettings.Collection().UpdateByID(ctx, owner.Key(),
			bson.M{"$set": bson.M{"extrasCategories": merged}}); err != nil {
			return "", fmt.Errorf("write planner settings for %s: %w", owner.Key(), err)
		}
	}
	if err := cursor.Err(); err != nil {
		return "", fmt.Errorf("walk application settings: %w", err)
	}

	verb := "moved onto"
	if dryRun {
		verb = "would move onto"
	}
	report := fmt.Sprintf("%d categor(ies) %s %d planner(s)", categories, verb, planners)
	if unseeded > 0 {
		report += fmt.Sprintf(", %d account(s) have no planner settings", unseeded)
	}
	return report, nil
}

// mergeExtrasCategories adds the categories the planner is missing and reports
// how many it added. A category the planner already holds is left alone,
// whatever the account's copy says about it.
//
// The planner's list is copied rather than appended to: appending to a slice
// with spare capacity writes into the array the caller is still holding, which
// is a write to the stored document this step has not decided to make.
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
