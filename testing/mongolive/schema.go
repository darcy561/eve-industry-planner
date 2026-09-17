package mongolive

import (
	"context"
	"errors"
	"fmt"
	"time"

	eipmongo "eve-industry-planner/shared/mongo"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// The schema a live run needs, mirrored from the Deployment Tool's Ensure.
//
// It cannot be imported: `eip ensure-mongo` shells mongosh through docker exec
// against a Swarm task, reads operator credentials from a kit env file, and
// lives in a module with no Mongo driver dependency at all. None of that exists
// on a runner. So the two lists are spelled twice and pinned by a test on each
// side, which is what index_specs.go already does for partial filters.
//
// Renames and retired-index drops are not mirrored. Both reconcile a database
// with history, and one this package creates has none.

// IndexKey is one field of an index key pattern.
type IndexKey struct {
	Field string
	Order int
}

// IndexSpec is one index the schema carries.
type IndexSpec struct {
	Collection string
	Name       string
	Keys       []IndexKey
}

// PreimageCollections need changeStreamPreAndPostImages, or a change stream
// reports an update with no document to compare against.
var PreimageCollections = []string{
	"job_groups",
	"job_documents",
	"accounts",
	"account_settings",
	"watchlist_deprecated",
}

// IndexSpecs mirrors the Deployment Tool's list.
func IndexSpecs() []IndexSpec {
	return []IndexSpec{
		{Collection: "planner_memberships", Name: "pm_accountID_1", Keys: []IndexKey{{"accountID", 1}}},
		{Collection: "planner_memberships", Name: "pm_plannerID_1", Keys: []IndexKey{{"plannerID", 1}}},
		{Collection: "accounts", Name: "meta_owner_1", Keys: []IndexKey{{"_meta.owner.kind", 1}, {"_meta.owner.id", 1}}},
		{Collection: "accounts", Name: "accounts_meta_lastLoginAt_1", Keys: []IndexKey{{"_meta.lastLoginAt", 1}}},
		{Collection: "account_settings", Name: "meta_owner_1", Keys: []IndexKey{{"_meta.owner.kind", 1}, {"_meta.owner.id", 1}}},
		{Collection: "job_groups", Name: "ajg_meta_owner_1", Keys: []IndexKey{{"_meta.owner.kind", 1}, {"_meta.owner.id", 1}}},
		{Collection: "watchlist_deprecated", Name: "awd_meta_owner_1", Keys: []IndexKey{{"_meta.owner.kind", 1}, {"_meta.owner.id", 1}}},
		{Collection: "job_documents", Name: "ajd_meta_owner_displayOnPlanner_1", Keys: []IndexKey{{"_meta.owner.kind", 1}, {"_meta.owner.id", 1}, {"displayOnPlanner", 1}}},
		{Collection: "job_documents", Name: "ajd_meta_owner_groupID_1", Keys: []IndexKey{{"_meta.owner.kind", 1}, {"_meta.owner.id", 1}, {"groupID", 1}}},
		{Collection: "job_documents", Name: "ajd_linkedJobs_corporation_id_1", Keys: []IndexKey{{"build.costs.linkedJobs.corporation_id", 1}}},
		{Collection: "job_documents", Name: "ajd_protected_spec_1", Keys: []IndexKey{{"protected.spec", 1}}},
		{Collection: "job_documents", Name: "ajd_meta_owner_marketOrders_order_id_1", Keys: []IndexKey{{"_meta.owner.kind", 1}, {"_meta.owner.id", 1}, {"build.sale.marketOrders.order_id", 1}}},
		{Collection: "job_documents", Name: "ajd_meta_owner_linkedJobs_job_id_1", Keys: []IndexKey{{"_meta.owner.kind", 1}, {"_meta.owner.id", 1}, {"build.costs.linkedJobs.job_id", 1}}},
		{Collection: "job_documents", Name: "ajd_meta_owner_transactions_transaction_id_1", Keys: []IndexKey{{"_meta.owner.kind", 1}, {"_meta.owner.id", 1}, {"build.sale.transactions.transaction_id", 1}}},
		{Collection: "archived_jobs", Name: "aj_linkedJobs_corporation_id_1", Keys: []IndexKey{{"build.costs.linkedJobs.corporation_id", 1}}},
		{Collection: "archived_jobs", Name: "aj_protected_spec_1", Keys: []IndexKey{{"protected.spec", 1}}},
		{Collection: "archived_jobs", Name: "aj_meta_owner_archivedAt_jobID_1", Keys: []IndexKey{{"_meta.owner.kind", 1}, {"_meta.owner.id", 1}, {"_meta.archivedAt", -1}, {"jobID", 1}}},
		{Collection: "archived_jobs", Name: "aj_meta_owner_name_jobID_1", Keys: []IndexKey{{"_meta.owner.kind", 1}, {"_meta.owner.id", 1}, {"name", 1}, {"jobID", 1}}},
		{Collection: "archived_jobs", Name: "aj_meta_owner_itemID_jobID_1", Keys: []IndexKey{{"_meta.owner.kind", 1}, {"_meta.owner.id", 1}, {"itemID", 1}, {"jobID", 1}}},
		{Collection: "archived_jobs", Name: "aj_meta_owner_jobType_jobID_1", Keys: []IndexKey{{"_meta.owner.kind", 1}, {"_meta.owner.id", 1}, {"jobType", 1}, {"jobID", 1}}},
		{Collection: "archived_jobs", Name: "aj_meta_owner_groupID_1", Keys: []IndexKey{{"_meta.owner.kind", 1}, {"_meta.owner.id", 1}, {"groupID", 1}}},
		{Collection: "statistics_rows", Name: "aajs_owner_revoked_contributedAt_1", Keys: []IndexKey{{"_meta.owner.kind", 1}, {"_meta.owner.id", 1}, {"revoked", 1}, {"contributedAt", 1}}},
		{Collection: "statistics_rows", Name: "aajs_owner_typeID_revoked_1", Keys: []IndexKey{{"_meta.owner.kind", 1}, {"_meta.owner.id", 1}, {"typeID", 1}, {"revoked", 1}}},
		{Collection: "statistics_timeline", Name: "atm_owner_isProductionChain_typeID_1", Keys: []IndexKey{{"_meta.owner.kind", 1}, {"_meta.owner.id", 1}, {"isProductionChain", 1}, {"typeID", 1}}},
		{Collection: "statistics_timeline", Name: "atm_owner_typeID_1", Keys: []IndexKey{{"_meta.owner.kind", 1}, {"_meta.owner.id", 1}, {"typeID", 1}}},
		{Collection: "statistics_totals", Name: "apt_owner_typeID_1", Keys: []IndexKey{{"_meta.owner.kind", 1}, {"_meta.owner.id", 1}, {"typeID", 1}}},
	}
}

// ensureSchema applies the pre-images and indexes to the database the handle is
// bound to, so a run against an empty database sees what the stack's schema
// gives it. Require calls it; no test calls it directly.
//
// Creating a collection is part of the work, not a precondition: collMod cannot
// enable pre-images on a collection that does not exist yet, and an index create
// makes one implicitly.
//
// It returns its error rather than failing a test, so the caller holding it
// across a binary can fail every test rather than only the first.
func ensureSchema(m *eipmongo.Mongo) error {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	for _, name := range PreimageCollections {
		if err := m.DB.CreateCollection(ctx, name); err != nil && !alreadyExists(err) {
			return fmt.Errorf("create %s: %w", name, err)
		}
		if err := m.DB.RunCommand(ctx, bson.D{
			{Key: "collMod", Value: name},
			{Key: "changeStreamPreAndPostImages", Value: bson.M{"enabled": true}},
		}).Err(); err != nil {
			return fmt.Errorf("pre-images on %s: %w", name, err)
		}
	}

	for _, spec := range IndexSpecs() {
		keys := bson.D{}
		for _, k := range spec.Keys {
			keys = append(keys, bson.E{Key: k.Field, Value: k.Order})
		}
		if _, err := m.DB.Collection(spec.Collection).Indexes().CreateOne(ctx, mongo.IndexModel{
			Keys:    keys,
			Options: options.Index().SetName(spec.Name),
		}); err != nil {
			return fmt.Errorf("index %s on %s: %w", spec.Name, spec.Collection, err)
		}
	}
	return nil
}

func alreadyExists(err error) bool {
	var cmdErr mongo.CommandError
	return errors.As(err, &cmdErr) && cmdErr.Code == 48
}
