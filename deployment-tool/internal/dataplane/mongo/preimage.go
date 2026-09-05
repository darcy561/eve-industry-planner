package mongo

import (
	"context"
	"fmt"
	"strings"
)

// PreimageCollections need changeStreamPreAndPostImages enabled (SoT; was bash CHANGE_STREAM_PREIMAGE_COLLECTIONS).
// New names apply on the next Ensure.
var PreimageCollections = []string{
	"job_groups",
	"job_documents",
	"accounts",
	"account_settings",
	"watchlist_deprecated",
}

// ensurePreimageJS: createCollection + collMod changeStreamPreAndPostImages.
// appDatabase is injected so DB name stays SoT with indexes/check.
//
// Creating a collection whose rename source is still present would strand that
// rename for good, because a rename refuses once both ends exist. Ensure orders
// renames first so this cannot happen; the guard makes a future reordering fail
// loudly instead of quietly stranding live data.
var ensurePreimageJS = fmt.Sprintf(`
const collName = process.env.EIP_COLLMOD_COLL_NAME;
if (!collName) {
  throw new Error("EIP_COLLMOD_COLL_NAME is not set");
}
const renameSources = (process.env.EIP_COLLMOD_RENAME_SOURCES || "")
  .split(",")
  .filter(function (s) { return s !== ""; });
const appDb = db.getSiblingDB(%q);
const names = appDb.getCollectionNames();
if (!names.includes(collName)) {
  const unrenamed = renameSources.filter(function (s) { return names.includes(s); });
  if (unrenamed.length > 0) {
    throw new Error("refusing to create " + collName +
      " while it is still named " + unrenamed.join(", ") +
      ": renames must run before preimages");
  }
  appDb.createCollection(collName);
}
const r = appDb.runCommand({
  collMod: collName,
  changeStreamPreAndPostImages: { enabled: true }
});
if (!r.ok) {
  throw new Error("collMod changeStreamPreAndPostImages failed for " + collName + ": " + tojson(r));
}
true;
`, appDatabase)

func ensurePreimages(ctx context.Context, cid string, c creds) error {
	for _, name := range PreimageCollections {
		if name == "" {
			continue
		}
		if err := requireSafeIdent("preimage collection name", name); err != nil {
			return err
		}
		env := []string{
			envCollMod + "=" + name,
			envRenameSources + "=" + strings.Join(renameSourcesFor(name), ","),
		}
		out, err := mongoshRoot(ctx, cid, c, ensurePreimageJS, env)
		if err != nil {
			return wrapMongoshErr(err, out, "mongo: preimage %s", name)
		}
	}
	return nil
}
