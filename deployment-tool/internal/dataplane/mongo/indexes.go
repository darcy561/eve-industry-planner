package mongo

import (
	"context"
	"fmt"
	"strings"

	"eve-industry-planner/deployment-tool/internal/msg"
)

type mongoshRootFn func(ctx context.Context, cid string, c creds, eval string, env []string) (string, error)

// ensureIndexes creates IndexSpecs via mongosh (idempotent; conflicts reconciled).
// Streams progress with msg so CLI/TUI stay live; no short timeout — waits for builds.
func ensureIndexes(ctx context.Context, cid string, c creds) error {
	return ensureIndexesWith(ctx, cid, c, mongoshRoot)
}

func ensureIndexesWith(ctx context.Context, cid string, c creds, run mongoshRootFn) error {
	if run == nil {
		run = mongoshRoot
	}
	specs := IndexSpecs()
	if len(specs) == 0 {
		return nil
	}
	msg.Step("Ensuring mongo indexes…")
	for _, spec := range specs {
		if err := ctx.Err(); err != nil {
			return err
		}
		msg.Line(fmt.Sprintf("  index %s.%s…", spec.Collection, spec.Name))
		eval, err := renderCreateIndexJS(spec)
		if err != nil {
			return err
		}
		out, err := run(ctx, cid, c, eval, nil)
		if err != nil {
			return wrapMongoshErr(err, out, "mongo: index %s.%s", spec.Collection, spec.Name)
		}
		for line := range strings.SplitSeq(out, "\n") {
			if strings.Contains(line, "reconciled index ") {
				msg.Line(strings.TrimRight(line, "\r"))
			}
		}
		msg.Line(fmt.Sprintf("  index %s.%s ok", spec.Collection, spec.Name))
	}
	return nil
}

func validateIndexSpec(spec IndexSpec) error {
	if err := requireSafeIdent("index collection", spec.Collection); err != nil {
		return err
	}
	if err := requireSafeIdent("index name", spec.Name); err != nil {
		return err
	}
	if len(spec.Keys) == 0 {
		return fmt.Errorf("mongo: index %s.%s: empty keys", spec.Collection, spec.Name)
	}
	for _, k := range spec.Keys {
		if k.Field == "" || (k.Order != 1 && k.Order != -1) {
			return fmt.Errorf("mongo: index %s.%s: bad key %#v", spec.Collection, spec.Name, k)
		}
	}
	return nil
}

func renderIndexKeysObj(keys []IndexKey) string {
	parts := make([]string, 0, len(keys))
	for _, k := range keys {
		parts = append(parts, fmt.Sprintf("%q: %d", k.Field, k.Order))
	}
	return "{" + strings.Join(parts, ", ") + "}"
}

func renderIndexOptsObj(spec IndexSpec) string {
	if pf := strings.TrimSpace(spec.PartialFilterJSON); pf != "" {
		return fmt.Sprintf(`{ name: %q, partialFilterExpression: %s }`, spec.Name, pf)
	}
	return fmt.Sprintf(`{ name: %q }`, spec.Name)
}

// renderCreateIndexJS builds mongosh --eval that createIndexes one spec.
//
// A conflict is reconciled rather than ignored. Renaming a collection carries
// its indexes over under their old names, so a spec routinely meets an index
// with its exact keys under a name from before the rename; treating that as
// "already done" leaves the spec list describing indexes the database does not
// have, and Ensure reporting success for work it skipped. Dropping the
// conflicting index and recreating it under the specced name costs a brief
// unindexed window inside a maintenance operation, and buys a database that
// matches its declaration.
func renderCreateIndexJS(spec IndexSpec) (string, error) {
	if err := validateIndexSpec(spec); err != nil {
		return "", err
	}
	return fmt.Sprintf(`
const appDb = db.getSiblingDB(%q);
const coll = appDb.getCollection(%q);
const keys = %s;
const opts = %s;
const wantKeys = JSON.stringify(keys);
try {
  coll.createIndex(keys, opts);
} catch (e) {
  const code = e.code;
  // 85 IndexOptionsConflict: these keys already exist under another name.
  // 86 IndexKeySpecsConflict: this name already exists over other keys.
  if (code !== 85 && code !== 86) {
    throw e;
  }
  const clashes = coll.getIndexes().filter(function (ix) {
    if (ix.name === "_id_") return false;
    return ix.name === opts.name || JSON.stringify(ix.key) === wantKeys;
  });
  clashes.forEach(function (ix) {
    coll.dropIndex(ix.name);
    print("  reconciled index " + coll.getName() + ": dropped " + ix.name);
  });
  coll.createIndex(keys, opts);
  print("  reconciled index " + coll.getName() + ": created " + opts.name);
}
true;
`, appDatabase, spec.Collection, renderIndexKeysObj(spec.Keys), renderIndexOptsObj(spec)), nil
}
