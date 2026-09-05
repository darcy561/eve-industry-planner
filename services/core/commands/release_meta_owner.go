package commands

import (
	"context"
	"fmt"
	"strings"

	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"
	"eve-industry-planner/shared/stackservices"

	"go.mongodb.org/mongo-driver/v2/bson"
	mongodriver "go.mongodb.org/mongo-driver/v2/mongo"
)

// metaOwnerCollections hold documents whose `_meta` carries the owner.
//
// Accounts and settings are here with the planner-scoped documents: their owner
// is the account itself, which keeps one `_meta` shape rather than one for
// account-owned documents and another for planner-held ones.
var metaOwnerCollections = []string{
	eipmongo.CollectionAccounts,
	eipmongo.CollectionAccountSettings,
	eipmongo.CollectionJobs,
	eipmongo.CollectionJobDocuments,
	eipmongo.CollectionJobGroups,
	eipmongo.CollectionArchivedJobs,
	eipmongo.CollectionWatchlistDeprecated,
}

// unstampedMetaOwner selects documents holding a usable account id and no owner,
// which is what makes the step resumable and safe to repeat.
//
// An empty or non-string account id is excluded rather than stamped: it would
// produce an owner addressing nothing, and a document that quietly addresses
// nothing is worse than one an operator is told about.
var unstampedMetaOwner = bson.M{
	"_meta.accountID": bson.M{"$type": "string", "$ne": ""},
	"_meta.owner":     bson.M{"$exists": false},
}

// missingMetaOwner selects documents with no owner at all, whether or not one
// could have been derived. It is what the release is verified against.
var missingMetaOwner = bson.M{"_meta.owner": bson.M{"$exists": false}}

// stampMetaOwner writes `_meta.owner` on documents that carry an account id and
// no owner.
//
// The owner is derived from the account id on the same document, so this runs as
// a pipeline server-side: no document travels to this process, and each is
// written atomically from its own field.
//
// `_meta.accountID` is left behind. Nothing reads it after this release, and an
// operator removes it once the figures have been checked — the same treatment the
// pre-release statistics collections get.
func stampMetaOwner(ctx context.Context, clients *stackservices.Clients, dryRun bool) (string, error) {
	stamp := mongodriver.Pipeline{{{Key: "$set", Value: bson.M{
		"_meta.owner": bson.M{
			"kind": string(models.OwnerAccount),
			"id":   "$_meta.accountID",
		},
	}}}}

	var reports []string
	var total int64
	for _, name := range metaOwnerCollections {
		coll := clients.Mongo.Coll(name)

		eligible, err := coll.CountDocuments(ctx, unstampedMetaOwner)
		if err != nil {
			return "", fmt.Errorf("count %s: %w", name, err)
		}
		unusable, err := coll.CountDocuments(ctx, bson.M{
			"_meta.owner": bson.M{"$exists": false},
			"$or": []bson.M{
				{"_meta.accountID": bson.M{"$exists": false}},
				{"_meta.accountID": ""},
			},
		})
		if err != nil {
			return "", fmt.Errorf("count unusable in %s: %w", name, err)
		}

		switch {
		case dryRun && eligible == 0:
			reports = append(reports, fmt.Sprintf("%s: none to stamp", name))
			continue
		case dryRun:
			reports = append(reports, fmt.Sprintf("%s: %d would be stamped", name, eligible))
			continue
		}

		res, err := coll.UpdateMany(ctx, unstampedMetaOwner, stamp)
		if err != nil {
			return "", fmt.Errorf("stamp %s: %w", name, err)
		}
		if res.ModifiedCount != eligible {
			return "", fmt.Errorf("%s: stamped %d of %d", name, res.ModifiedCount, eligible)
		}
		total += res.ModifiedCount

		report := fmt.Sprintf("%s: %d stamped", name, res.ModifiedCount)
		if unusable > 0 {
			// Named rather than passed over: nothing reads a document with no
			// owner, and no later save adds one.
			report += fmt.Sprintf(", %d with no usable account id", unusable)
		}
		reports = append(reports, report)
	}

	if !dryRun {
		reports = append(reports, fmt.Sprintf("%d total", total))
	}
	return strings.Join(reports, "; "), nil
}

// verifyMetaOwner fails the release if any document is left without an owner.
//
// The stamp reports documents it could not derive an owner for rather than
// failing on them, so a run can finish having left some behind. Nothing reads a
// document with no owner and no later save adds one, so the check is what turns
// that from silent loss into a failed release.
func verifyMetaOwner(ctx context.Context, clients *stackservices.Clients, dryRun bool) (string, error) {
	var offenders []string
	var total int64
	for _, name := range metaOwnerCollections {
		count, err := clients.Mongo.Coll(name).CountDocuments(ctx, missingMetaOwner)
		if err != nil {
			return "", fmt.Errorf("count %s: %w", name, err)
		}
		if count > 0 {
			offenders = append(offenders, fmt.Sprintf("%s: %d", name, count))
			total += count
		}
	}
	if total == 0 {
		return "every document carries an owner", nil
	}
	if dryRun {
		return fmt.Sprintf("%d document(s) would still have no owner (%s)", total, strings.Join(offenders, ", ")), nil
	}
	return "", fmt.Errorf("%d document(s) have no owner and are unreachable: %s", total, strings.Join(offenders, ", "))
}
