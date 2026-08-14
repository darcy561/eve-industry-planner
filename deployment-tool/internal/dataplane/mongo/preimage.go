package mongo

import (
	"context"
	"fmt"
)

// PreimageCollections need changeStreamPreAndPostImages enabled (SoT; was bash CHANGE_STREAM_PREIMAGE_COLLECTIONS).
// New names apply on the next Ensure.
var PreimageCollections = []string{
	"user_job_groups",
	"user_job_documents",
	"users",
	"application_settings",
	"user_watchlist_deprecated",
}

// ensurePreimageJS: createCollection + collMod changeStreamPreAndPostImages.
// appDatabase is injected so DB name stays SoT with indexes/check.
var ensurePreimageJS = fmt.Sprintf(`
const collName = process.env.EIP_COLLMOD_COLL_NAME;
if (!collName) {
  throw new Error("EIP_COLLMOD_COLL_NAME is not set");
}
const appDb = db.getSiblingDB(%q);
const names = appDb.getCollectionNames();
if (!names.includes(collName)) {
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
		env := []string{envCollMod + "=" + name}
		out, err := mongoshRoot(ctx, cid, c, ensurePreimageJS, env)
		if err != nil {
			return wrapMongoshErr(err, out, "mongo: preimage %s", name)
		}
	}
	return nil
}
