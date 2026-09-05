package commands

import (
	"context"
	"fmt"

	eipmongo "eve-industry-planner/shared/mongo"
	"eve-industry-planner/shared/stackservices"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// jobCollectionsHoldingExtras are the collections whose documents carry
// build.costs.extrasCosts. Statistics rows are not among them: they are derived,
// so the rebuild queued later in the release regenerates their labels from the
// jobs this step stamps.
var jobCollectionsHoldingExtras = []string{eipmongo.CollectionJobs, eipmongo.CollectionArchivedJobs}

// stampExtrasCategoryLabels writes each extra cost's category name onto the job
// that holds it.
//
// An extra stored only a category id, and the name was read from the account's
// settings when a screen drew it. That is why a deleted category renders as its
// id, and why a second member of a shared planner cannot read another member's
// categories at all.
//
// The names are only recoverable here. A job's statistics row is derived from the
// job alone — the rule that lets it be written wherever the job is archived — so
// the derivation cannot reach a settings document. A release step can, and the
// settings list keeps a deleted category rather than dropping it, so the name is
// still there to copy.
func stampExtrasCategoryLabels(ctx context.Context, clients *stackservices.Clients, dryRun bool) (string, error) {
	settings := clients.Mongo.ApplicationSettings.Collection()

	cursor, err := settings.Find(ctx, bson.M{}, nil)
	if err != nil {
		return "", fmt.Errorf("read application settings: %w", err)
	}
	defer cursor.Close(ctx)

	accounts, stamped, skipped := 0, 0, 0
	for cursor.Next(ctx) {
		var doc struct {
			ID               string `bson:"_id"`
			ExtrasCategories []struct {
				ID    any    `bson:"id"`
				Label string `bson:"label"`
			} `bson:"extrasCategories"`
		}
		if err := cursor.Decode(&doc); err != nil {
			return "", fmt.Errorf("decode application settings: %w", err)
		}

		labels := make(map[string]string, len(doc.ExtrasCategories))
		for _, category := range doc.ExtrasCategories {
			id := fmt.Sprintf("%v", category.ID)
			if id != "" && category.Label != "" {
				labels[id] = category.Label
			}
		}
		if len(labels) == 0 {
			continue
		}
		accounts++

		for _, collection := range jobCollectionsHoldingExtras {
			n, unnamed, err := stampAccountExtras(ctx, clients, collection, doc.ID, labels, dryRun)
			if err != nil {
				return "", fmt.Errorf("%s for %s: %w", collection, doc.ID, err)
			}
			stamped += n
			skipped += unnamed
		}
	}
	if err := cursor.Err(); err != nil {
		return "", fmt.Errorf("walk application settings: %w", err)
	}

	verb := "stamped"
	if dryRun {
		verb = "would stamp"
	}
	if skipped == 0 {
		return fmt.Sprintf("%s %d extra(s) across %d account(s)", verb, stamped, accounts), nil
	}
	// A category the settings list no longer holds at all cannot be named. The
	// row keeps its id, which is what every reader had before this.
	return fmt.Sprintf("%s %d extra(s) across %d account(s); %d name no category the account still lists",
		verb, stamped, accounts, skipped), nil
}

func stampAccountExtras(
	ctx context.Context,
	clients *stackservices.Clients,
	collection, accountID string,
	labels map[string]string,
	dryRun bool,
) (stamped, unnamed int, err error) {
	coll := clients.Mongo.Coll(collection)
	filter := bson.M{"_meta.accountID": accountID, "build.costs.extrasCosts.0": bson.M{"$exists": true}}

	cursor, err := coll.Find(ctx, filter, nil)
	if err != nil {
		return 0, 0, err
	}
	defer cursor.Close(ctx)

	for cursor.Next(ctx) {
		var job struct {
			ID    string `bson:"_id"`
			Build struct {
				Costs struct {
					ExtrasCosts []bson.M `bson:"extrasCosts"`
				} `bson:"costs"`
			} `bson:"build"`
		}
		if err := cursor.Decode(&job); err != nil {
			return 0, 0, err
		}

		rows := job.Build.Costs.ExtrasCosts
		changed := false
		for i, row := range rows {
			if existing, _ := row["categoryLabel"].(string); existing != "" {
				continue
			}
			id := fmt.Sprintf("%v", row["category"])
			if id == "" || id == "<nil>" {
				id = "0"
			}
			label, known := labels[id]
			if !known {
				unnamed++
				continue
			}
			rows[i]["categoryLabel"] = label
			changed = true
			stamped++
		}
		if !changed || dryRun {
			continue
		}
		if _, err := coll.UpdateByID(ctx, job.ID, bson.M{"$set": bson.M{"build.costs.extrasCosts": rows}}); err != nil {
			return 0, 0, err
		}
	}
	return stamped, unnamed, cursor.Err()
}
