package mongo

import (
	"context"
	"fmt"
	"strings"

	"eve-industry-planner/deployment-tool/internal/msg"
)

// RetiredIndex is an index Ensure removes.
type RetiredIndex struct {
	Collection string
	Name       string
	// Why records what replaced it, for whoever prunes this list.
	Why string
}

// RetiredIndexes are dropped before IndexSpecs are created.
//
// Ensure otherwise only ever adds, so an index that changes shape would leave
// its predecessor behind to be maintained on every write and chosen by no query.
// Reconciling a name conflict does not cover this: a replacement with different
// keys under a different name does not conflict with anything, so both survive.
//
// Dropping is idempotent — an index already gone is skipped — so entries stay as
// a record. Only name an index that a current spec replaces, or one whose fields
// the documents no longer carry; an index nothing declares is not thereby dead.
var RetiredIndexes = []RetiredIndex{
	{
		Collection: "archived_jobs",
		Name:       "aj_meta_accountID_archivedAt_1",
		Why:        "replaced by aj_meta_accountID_archivedAt_jobID_1, which carries the list's tiebreaker",
	},
	{
		Collection: "archived_jobs",
		Name:       "aj_meta_accountID_itemID_1",
		Why:        "replaced by aj_meta_accountID_itemID_jobID_1, which carries the list's tiebreaker",
	},
	{
		Collection: "archived_jobs",
		Name:       "meta_accountID_1__id_1_unprocessed_archived_jobs",
		Why:        "hand-made before the specs; no query leads with accountID and _id",
	},
	{
		Collection: "archived_jobs",
		Name:       "meta_accountID_1_meta_archivedAt_-1__id_-1",
		Why:        "hand-made before the specs; the list breaks ties on jobID, not _id",
	},
	{
		Collection: "statistics_rows",
		Name:       "aajs_owner_typeID_isProductionChain_revoked_1",
		Why:        "isProductionChain is filtered on the month buckets, never on the rows",
	},
	{
		Collection: "statistics_rows",
		Name:       "aajs_owner_archivedAt_revoked_1",
		Why:        "a row's archivedAt is never filtered or sorted; the fold reads contributedAt",
	},
	{
		Collection: "statistics_timeline",
		Name:       "atm_owner_year_month_typeID_1",
		Why:        "the month range is bound on a computed ordinal, which no index serves",
	},
	{
		Collection: "statistics_timeline",
		Name:       "atm_owner_typeID_year_month_1",
		Why:        "replaced by atm_owner_typeID_1; the year and month tail served nothing",
	},
	// The owner key replaced accountID on the statistics documents. These indexed
	// the field it replaced.
	{
		Collection: "statistics_rows",
		Name:       "accountID_1_typeID_1_isProductionChain_1_revoked_1",
		Why:        "rows are keyed by owner",
	},
	{
		Collection: "statistics_rows",
		Name:       "accountID_1_archivedAt_1_revoked_1",
		Why:        "rows are keyed by owner",
	},
	{
		Collection: "statistics_rows",
		Name:       "accountID_1_typeID_1_rollups_active_partial",
		Why:        "rows are keyed by owner",
	},
	{
		Collection: "statistics_rows",
		Name:       "transactionLines.year_1_transactionLines.month_1_transactionLines.corpStatus_1",
		Why:        "a transaction line has carried no corpStatus for some time",
	},
	{
		Collection: "statistics_timeline",
		Name:       "atm_accountID_year_month_typeID_1",
		Why:        "buckets are keyed by owner",
	},
	{
		Collection: "statistics_timeline",
		Name:       "atm_accountID_typeID_year_month_1",
		Why:        "buckets are keyed by owner",
	},
	{
		Collection: "statistics_totals",
		Name:       "apt_accountID_typeID_1",
		Why:        "totals are keyed by owner",
	},
	// _meta.accountID is not a field any document carries now, so these index
	// nothing and are chosen by no query. Each has a replacement under the
	// matching _meta_owner name leading with the owner's kind and id.
	{
		Collection: "accounts",
		Name:       "meta_accountID_1",
		Why:        "documents are keyed by owner",
	},
	{
		Collection: "account_settings",
		Name:       "meta_accountID_1",
		Why:        "documents are keyed by owner",
	},
	{
		Collection: "job_groups",
		Name:       "ajg_meta_accountID_1",
		Why:        "documents are keyed by owner",
	},
	{
		Collection: "watchlist_deprecated",
		Name:       "awd_meta_accountID_1",
		Why:        "documents are keyed by owner",
	},
	{
		Collection: "job_documents",
		Name:       "ajd_meta_accountID_displayOnPlanner_1",
		Why:        "documents are keyed by owner",
	},
	{
		Collection: "job_documents",
		Name:       "ajd_meta_accountID_groupID_1",
		Why:        "documents are keyed by owner",
	},
	{
		Collection: "job_documents",
		Name:       "ajd_meta_accountID_marketOrders_order_id_1",
		Why:        "documents are keyed by owner",
	},
	{
		Collection: "job_documents",
		Name:       "ajd_meta_accountID_linkedJobs_job_id_1",
		Why:        "documents are keyed by owner",
	},
	{
		Collection: "job_documents",
		Name:       "ajd_meta_accountID_transactions_transaction_id_1",
		Why:        "documents are keyed by owner",
	},
	{
		Collection: "archived_jobs",
		Name:       "aj_meta_accountID_archivedAt_jobID_1",
		Why:        "documents are keyed by owner",
	},
	{
		Collection: "archived_jobs",
		Name:       "aj_meta_accountID_name_jobID_1",
		Why:        "documents are keyed by owner",
	},
	{
		Collection: "archived_jobs",
		Name:       "aj_meta_accountID_itemID_jobID_1",
		Why:        "documents are keyed by owner",
	},
	{
		Collection: "archived_jobs",
		Name:       "aj_meta_accountID_jobType_jobID_1",
		Why:        "documents are keyed by owner",
	},
	{
		Collection: "archived_jobs",
		Name:       "aj_meta_accountID_groupID_1",
		Why:        "documents are keyed by owner",
	},
}

// renderDropIndexJS drops one index, treating an absent index or collection as
// done rather than as a failure.
func renderDropIndexJS(retired RetiredIndex) (string, error) {
	if err := requireSafeIdent("retired index collection", retired.Collection); err != nil {
		return "", err
	}
	if retired.Name == "" || retired.Name == "_id_" {
		return "", fmt.Errorf("mongo: retired index %s: bad name %q", retired.Collection, retired.Name)
	}
	return fmt.Sprintf(`
const appDb = db.getSiblingDB(%q);
const collName = %q;
const name = %q;
// getIndexes() throws "ns does not exist" rather than returning nothing, and a
// collection this database has never held is the ordinary case on a first
// population — so the collection is checked before the index is.
if (appDb.getCollectionNames().includes(collName)) {
  const coll = appDb.getCollection(collName);
  if (coll.getIndexes().some(function (ix) { return ix.name === name; })) {
    coll.dropIndex(name);
    print("  dropped retired index " + collName + "." + name);
  }
}
true;
`, appDatabase, retired.Collection, retired.Name), nil
}

func dropRetiredIndexes(ctx context.Context, cid string, c creds) error {
	return dropRetiredIndexesWith(ctx, cid, c, mongoshRoot)
}

func dropRetiredIndexesWith(ctx context.Context, cid string, c creds, run mongoshRootFn) error {
	if run == nil {
		run = mongoshRoot
	}
	if len(RetiredIndexes) == 0 {
		return nil
	}
	for _, retired := range RetiredIndexes {
		if err := ctx.Err(); err != nil {
			return err
		}
		eval, err := renderDropIndexJS(retired)
		if err != nil {
			return err
		}
		out, err := run(ctx, cid, c, eval, nil)
		if err != nil {
			return wrapMongoshErr(err, out, "mongo: retired index %s.%s", retired.Collection, retired.Name)
		}
		if containsDroppedLine(out) {
			msg.Line(fmt.Sprintf("  dropped retired index %s.%s", retired.Collection, retired.Name))
		}
	}
	return nil
}

func containsDroppedLine(out string) bool {
	return strings.Contains(out, "dropped retired index ")
}
