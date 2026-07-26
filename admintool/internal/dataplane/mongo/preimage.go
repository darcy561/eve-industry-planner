package mongo

import (
	"context"
	"fmt"
	"regexp"
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

var safeCollName = regexp.MustCompile(`^[a-zA-Z0-9_-]+$`)

// ensurePreimageJS matches scripts/bootstrap/mongo-setup.sh collMod loop.
const ensurePreimageJS = `
const collName = process.env.EIP_COLLMOD_COLL_NAME;
if (!collName) {
  throw new Error("EIP_COLLMOD_COLL_NAME is not set");
}
const appDb = db.getSiblingDB("eve_industry_planner");
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
`

func ensurePreimages(ctx context.Context, cid string, c creds) error {
	for _, name := range PreimageCollections {
		if name == "" {
			continue
		}
		if !safeCollName.MatchString(name) {
			return fmt.Errorf("mongo: invalid preimage collection name %q", name)
		}
		env := []string{envCollMod + "=" + name}
		out, err := mongoshRoot(ctx, cid, c, ensurePreimageJS, env)
		if err != nil {
			if out != "" {
				return fmt.Errorf("mongo: preimage %s: %w\n%s", name, err, out)
			}
			return fmt.Errorf("mongo: preimage %s: %w", name, err)
		}
	}
	return nil
}
