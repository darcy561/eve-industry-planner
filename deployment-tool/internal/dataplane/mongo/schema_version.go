package mongo

import (
	"context"
	"fmt"
	"strconv"
	"strings"
)

// deployStateCollection holds the structural state of the application database.
//
// It is owned by the Deployment Tool: no service reads it, so it is absent from
// services/shared/mongo/names.go and from knownCollections. It takes the shared_
// prefix because its single row means the same thing to every caller.
const deployStateCollection = "shared_deploy_state"

// deployStateID names the one document in that collection.
const deployStateID = "dataplane"

// schemaVersionRead reports the structural version recorded in the database.
//
// A database that has never been through Ensure has no document and reads as 0,
// which is below every step's version, so a first run applies everything.
func schemaVersionRead(ctx context.Context, cid string, c creds, run mongoshRootFn) (int, error) {
	if run == nil {
		run = mongoshRoot
	}
	js := fmt.Sprintf(`
const appDb = db.getSiblingDB(%q);
const doc = appDb.getCollection(%q).findOne({ _id: %q });
String(doc && typeof doc.version === "number" ? doc.version : 0);
`, appDatabase, deployStateCollection, deployStateID)

	out, err := run(ctx, cid, c, js, nil)
	if err != nil {
		return 0, wrapMongoshErr(err, out, "mongo: read schema version")
	}
	v, err := parseSchemaVersion(out)
	if err != nil {
		return 0, fmt.Errorf("mongo: read schema version: %w", err)
	}
	return v, nil
}

// schemaVersionWrite records version as the structural state reached.
//
// Written only after the steps it covers have succeeded, so a failure part way
// through leaves the old version and the next run retries from there.
func schemaVersionWrite(ctx context.Context, cid string, c creds, run mongoshRootFn, version int) error {
	if run == nil {
		run = mongoshRoot
	}
	js := fmt.Sprintf(`
const appDb = db.getSiblingDB(%q);
appDb.getCollection(%q).updateOne(
  { _id: %q },
  { $set: { version: %d, updatedAt: new Date() } },
  { upsert: true }
);
"ok";
`, appDatabase, deployStateCollection, deployStateID, version)

	out, err := run(ctx, cid, c, js, nil)
	if err != nil {
		return wrapMongoshErr(err, out, "mongo: record schema version %d", version)
	}
	return nil
}

// parseSchemaVersion reads the version off mongosh output, which may carry
// connection banners ahead of the value.
func parseSchemaVersion(out string) (int, error) {
	last := ""
	for line := range strings.SplitSeq(out, "\n") {
		if trimmed := strings.TrimSpace(line); trimmed != "" {
			last = trimmed
		}
	}
	if last == "" {
		return 0, fmt.Errorf("no version in output")
	}
	v, err := strconv.Atoi(strings.Trim(last, `"`))
	if err != nil {
		return 0, fmt.Errorf("unreadable version %q", last)
	}
	if v < 0 {
		return 0, fmt.Errorf("negative version %d", v)
	}
	return v, nil
}
