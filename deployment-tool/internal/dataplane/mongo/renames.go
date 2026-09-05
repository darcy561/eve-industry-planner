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
	// Version is the structural version this rename belongs to. Ensure skips
	// every rename at or below the version the database records, so a settled
	// database costs one read rather than one exec per entry. Renames landing
	// together share a version; a later batch takes the next one.
	Version int
}

// CollectionRenames is applied in order by Ensure, before indexes.
//
// Entries stay after they have run. Each one is idempotent — a rename whose
// source is already gone is skipped — so the list is a history rather than a
// queue to be emptied. Removing an entry once every environment has applied it
// is safe; removing it early strands whichever environment had not yet run
// Ensure.
//
// A database records the highest Version it has applied, so entries at or below
// it are skipped without touching the database at all. An entry added to a
// version already recorded would never run: give a new rename the next version.
//
// Renaming a collection the SPA subscribes to over the changestream is a
// client-facing break, not just a storage change. Check the changestream
// collection groups and the websocket subscribe allow-list before adding one.
var CollectionRenames = []CollectionRename{
	{
		From:    "user_group_template_catalog",
		To:      "group_template_catalog",
		Why:     "scope prefix: the rows are scoped by account, not by character",
		Version: 1,
	},
	{
		From:    "user_group_template_payloads",
		To:      "group_template_payloads",
		Why:     "scope prefix: the rows are scoped by account, not by character",
		Version: 1,
	},
	{
		From:    "citadel_names",
		To:      "shared_citadel_names",
		Why:     "reference data every caller reads identically takes the shared prefix",
		Version: 1,
	},
	{
		From:    "blueprints",
		To:      "shared_blueprints",
		Why:     "reference data every caller reads identically takes the shared prefix",
		Version: 1,
	},
	{
		From:    "user_watchlist_deprecated",
		To:      "watchlist_deprecated",
		Why:     "scope prefix: the rows are scoped by account, not by character; the deprecated suffix describes the feature, not the scope",
		Version: 1,
	},
	{
		From:    "users",
		To:      "accounts",
		Why:     "the collection is the account records, so the tier word is the noun",
		Version: 1,
	},
	{
		From:    "application_settings",
		To:      "account_settings",
		Why:     "scope prefix: the rows are scoped by account, not by character",
		Version: 1,
	},
	{
		From:    "user_job_documents",
		To:      "job_documents",
		Why:     "scope prefix: the rows are scoped by account, not by character",
		Version: 1,
	},
	{
		From:    "user_job_groups",
		To:      "job_groups",
		Why:     "scope prefix: the rows are scoped by account, not by character",
		Version: 1,
	},
	{
		From:    "archivedJobs",
		To:      "archived_jobs",
		Why:     "scope prefix: the rows are scoped by account, not by character; also the only camelCase name, snake_cased by the same move",
		Version: 1,
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
	return ensureRenamesWith(ctx, cid, c, mongoshRoot)
}

// schemaVersionCurrent is the highest structural version the tool knows how to
// apply: the version a database reaches once Ensure completes.
func schemaVersionCurrent() int {
	highest := 0
	for _, r := range CollectionRenames {
		if r.Version > highest {
			highest = r.Version
		}
	}
	return highest
}

// pendingRenames selects the renames a database at applied has not yet had.
func pendingRenames(applied int) []CollectionRename {
	var pending []CollectionRename
	for _, r := range CollectionRenames {
		if r.Version > applied {
			pending = append(pending, r)
		}
	}
	return pending
}

func ensureRenamesWith(ctx context.Context, cid string, c creds, run mongoshRootFn) error {
	if run == nil {
		run = mongoshRoot
	}
	for _, r := range CollectionRenames {
		if r.Version < 1 {
			return fmt.Errorf("mongo: collection rename %q -> %q needs a Version of 1 or more", r.From, r.To)
		}
	}

	applied, err := schemaVersionRead(ctx, cid, c, run)
	if err != nil {
		return err
	}
	current := schemaVersionCurrent()

	pending := pendingRenames(applied)
	if len(pending) == 0 {
		if applied > current {
			msg.Line(fmt.Sprintf("collection names ahead of this binary (database %d, binary %d)", applied, current))
		}
		return nil
	}

	for _, r := range pending {
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
		out, err := run(ctx, cid, c, js, nil)
		if err != nil {
			return wrapMongoshErr(err, out, "mongo: rename %s -> %s", r.From, r.To)
		}
		if strings.Contains(out, "renamed") {
			msg.Line(fmt.Sprintf("renamed %s -> %s", r.From, r.To))
		}
	}

	if current > applied {
		return schemaVersionWrite(ctx, cid, c, run, current)
	}
	return nil
}

// renameSourcesFor lists the names a collection is reached from by a pending
// rename, so a step that would otherwise create it can tell an absent
// collection apart from one that has not been renamed yet.
func renameSourcesFor(target string) []string {
	var sources []string
	for _, r := range CollectionRenames {
		if r.To == target {
			sources = append(sources, r.From)
		}
	}
	return sources
}
