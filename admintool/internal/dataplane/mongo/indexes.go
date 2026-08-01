package mongo

import (
	"context"
	"fmt"
	"strings"

	"eve-industry-planner/admintool/internal/msg"
)

type mongoshRootFn func(ctx context.Context, cid string, c creds, eval string, env []string) (string, error)

// ensureIndexes creates IndexSpecs via mongosh (idempotent; ignore already-exists).
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

// renderCreateIndexJS builds mongosh --eval that createIndexes one spec (fail-closed except already-exists).
func renderCreateIndexJS(spec IndexSpec) (string, error) {
	if err := validateIndexSpec(spec); err != nil {
		return "", err
	}
	return fmt.Sprintf(`
const appDb = db.getSiblingDB(%q);
const coll = appDb.getCollection(%q);
try {
  coll.createIndex(%s, %s);
} catch (e) {
  const code = e.code;
  const msg = String(e.message || e).toLowerCase();
  if (code === 85 || code === 86 || msg.includes("already exists") || msg.includes("duplicate key")) {
    // idempotent
  } else {
    throw e;
  }
}
true;
`, appDatabase, spec.Collection, renderIndexKeysObj(spec.Keys), renderIndexOptsObj(spec)), nil
}
