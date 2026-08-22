package mongo

import (
	"context"
	"fmt"
	"strings"

	"eve-industry-planner/deployment-tool/internal/msg"
)

// CollectionRename moves one collection to a new name.
//
// Renames are declared here rather than performed ad hoc so that a name change
// is a reviewable diff and reaches every environment through the same verb that
// applies indexes and preimages.
type CollectionRename struct {
	From string
	To   string
	// Why records the reason the name changed, for the operator reading a log
	// line months later and for whoever prunes this list.
	Why string
}

// CollectionRenames is applied in order by Ensure, before indexes.
//
// Entries stay after they have run. Each one is idempotent — a rename whose
// source is already gone is skipped — so the list is a history that costs one
// existence check per entry, not a queue to be emptied. Removing an entry once
// every environment has applied it is safe; removing it early strands whichever
// environment had not yet run Ensure.
//
// Renaming a collection the SPA subscribes to over the changestream is a
// client-facing break, not just a storage change. Check the changestream
// collection groups and the websocket subscribe allow-list before adding one.
var CollectionRenames = []CollectionRename{
	{
		From: "user_archived_job_stats",
		To:   "account_archived_job_stats",
		Why:  "scope prefix: the rows are scoped by account, not by character",
	},
	{
		From: "user_group_template_catalog",
		To:   "account_group_template_catalog",
		Why:  "scope prefix: the rows are scoped by account, not by character",
	},
	{
		From: "user_group_template_payloads",
		To:   "account_group_template_payloads",
		Why:  "scope prefix: the rows are scoped by account, not by character",
	},
	{
		From: "stats_rebuild_queue_accounts",
		To:   "account_stats_rebuild_queue",
		Why:  "scope prefix leads the name, matching every other account collection",
	},
	{
		From: "citadel_names",
		To:   "shared_citadel_names",
		Why:  "reference data every caller reads identically takes the shared prefix",
	},
	{
		From: "blueprints",
		To:   "shared_blueprints",
		Why:  "reference data every caller reads identically takes the shared prefix",
	},
	{
		From: "user_watchlist_deprecated",
		To:   "account_watchlist_deprecated",
		Why:  "scope prefix: the rows are scoped by account, not by character; the deprecated suffix describes the feature, not the scope",
	},
	{
		From: "users",
		To:   "accounts",
		Why:  "the collection is the account records, so the tier word is the noun",
	},
	{
		From: "application_settings",
		To:   "account_settings",
		Why:  "scope prefix: the rows are scoped by account, not by character",
	},
	{
		From: "jobs",
		To:   "account_jobs",
		Why:  "scope prefix: the rows are scoped by account, not by character",
	},
	{
		From: "user_job_documents",
		To:   "account_job_documents",
		Why:  "scope prefix: the rows are scoped by account, not by character",
	},
	{
		From: "user_job_groups",
		To:   "account_job_groups",
		Why:  "scope prefix: the rows are scoped by account, not by character",
	},
	{
		From: "archivedJobs",
		To:   "account_archived_jobs",
		Why:  "scope prefix: the rows are scoped by account, not by character; also the only camelCase name, snake_cased by the same move",
	},
	{
		From: "user_rollup_buckets",
		To:   "account_timeline_months",
		Why:  "scope prefix: the rows are scoped by account, not by character; months is what the documents hold, and timeline is the wire vocabulary",
	},
	{
		From: "build_stats",
		To:   "account_production_totals",
		Why:  "scope prefix: the rows are scoped by account, not by character; production totals says what is measured rather than naming a category",
	},
}

// renameCollectionJS renames appDb.<from> to <to>.
//
// Skips when the source is absent, which is what makes re-running Ensure safe.
// Fails when the target already exists and the source still does, rather than
// dropping either: two collections that both hold documents need a human to say
// which survives.
const renameCollectionJS = `
const appDb = db.getSiblingDB(%q);
const from = %q;
const to = %q;

const hasFrom = appDb.getCollectionNames().includes(from);
const hasTo = appDb.getCollectionNames().includes(to);

if (!hasFrom && hasTo) {
  "already-renamed";
} else if (!hasFrom && !hasTo) {
  "absent";
} else if (hasFrom && hasTo) {
  throw new Error(
    "both " + from + " and " + to + " exist; refusing to rename. " +
    "Resolve by hand: one of them holds the documents that should survive."
  );
} else {
  const r = appDb.adminCommand({
    renameCollection: %q + "." + from,
    to: %q + "." + to
  });
  if (!r.ok) {
    throw new Error("renameCollection " + from + " -> " + to + " failed: " + tojson(r));
  }
  "renamed";
}
`

// ensureRenames applies CollectionRenames in order.
//
// Runs before ensureIndexes so that index specs describe collections by their
// current names: a rename carries its indexes with it, and the index pass then
// reconciles whatever the specs declare.
func ensureRenames(ctx context.Context, cid string, c creds) error {
	for _, r := range CollectionRenames {
		if r.From == "" || r.To == "" {
			return fmt.Errorf("mongo: collection rename needs both From and To (got %q -> %q)", r.From, r.To)
		}
		if r.From == r.To {
			return fmt.Errorf("mongo: collection rename %q has the same source and target", r.From)
		}
		if err := requireSafeIdent("rename source collection", r.From); err != nil {
			return err
		}
		if err := requireSafeIdent("rename target collection", r.To); err != nil {
			return err
		}

		js := fmt.Sprintf(renameCollectionJS, appDatabase, r.From, r.To, appDatabase, appDatabase)
		out, err := mongoshRoot(ctx, cid, c, js, nil)
		if err != nil {
			return wrapMongoshErr(err, out, "mongo: rename %s -> %s", r.From, r.To)
		}
		if strings.Contains(out, "renamed") {
			msg.Line(fmt.Sprintf("renamed %s -> %s", r.From, r.To))
		}
	}
	return nil
}
