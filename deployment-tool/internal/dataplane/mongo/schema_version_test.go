package mongo

import (
	"context"
	"strings"
	"testing"
)

func TestParseSchemaVersion(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name string
		out  string
		want int
		bad  bool
	}{
		{name: "plain", out: "3\n", want: 3},
		{name: "quoted", out: "\"7\"\n", want: 7},
		{name: "absent document reads zero", out: "0\n", want: 0},
		{name: "banner ahead of the value", out: "Current Mongosh Log ID: abc\nUsing database: eve_industry_planner\n12\n", want: 12},
		{name: "empty", out: "  \n", bad: true},
		{name: "not a number", out: "undefined\n", bad: true},
		{name: "negative", out: "-1\n", bad: true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got, err := parseSchemaVersion(tc.out)
			if tc.bad {
				if err == nil {
					t.Fatalf("parseSchemaVersion(%q) = %d, want error", tc.out, got)
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			if got != tc.want {
				t.Fatalf("parseSchemaVersion(%q) = %d, want %d", tc.out, got, tc.want)
			}
		})
	}
}

// Every declared rename must be reachable: an entry at or below a version the
// tool already reports as current would be skipped on every database that has
// run Ensure, including the one it was written for.
func TestEveryRenameIsReachable(t *testing.T) {
	t.Parallel()
	current := schemaVersionCurrent()
	for _, r := range CollectionRenames {
		if r.Version < 1 {
			t.Fatalf("rename %q -> %q has version %d; versions start at 1", r.From, r.To, r.Version)
		}
		if r.Version > current {
			t.Fatalf("rename %q -> %q has version %d above the current %d", r.From, r.To, r.Version, current)
		}
	}
	if len(pendingRenames(0)) != len(CollectionRenames) {
		t.Fatalf("a fresh database would skip renames: pending=%d of %d", len(pendingRenames(0)), len(CollectionRenames))
	}
	if got := pendingRenames(current); got != nil {
		t.Fatalf("a database at the current version still has %d pending renames", len(got))
	}
}

// recorder stands in for mongosh, answering the version read and counting what
// Ensure asks the database to do.
type recorder struct {
	version string
	calls   []string
}

func (r *recorder) run(_ context.Context, _ string, _ creds, eval string, _ []string) (string, error) {
	r.calls = append(r.calls, eval)
	if strings.Contains(eval, "findOne({ _id:") {
		return r.version + "\n", nil
	}
	if strings.Contains(eval, "renameCollection") {
		return "absent\n", nil
	}
	return "ok\n", nil
}

// A settled database costs one read and nothing else — the point of recording a
// version rather than asking the database about each rename in turn.
func TestEnsureRenamesSkipsAtCurrentVersion(t *testing.T) {
	t.Parallel()
	rec := &recorder{version: "1"}
	if err := ensureRenamesWith(t.Context(), "cid", creds{}, rec.run); err != nil {
		t.Fatal(err)
	}
	if len(rec.calls) != 1 {
		t.Fatalf("calls=%d want 1 (the version read); got %v", len(rec.calls), rec.calls)
	}
}

func TestEnsureRenamesAppliesAndRecords(t *testing.T) {
	t.Parallel()
	rec := &recorder{version: "0"}
	if err := ensureRenamesWith(t.Context(), "cid", creds{}, rec.run); err != nil {
		t.Fatal(err)
	}

	want := 1 + len(CollectionRenames) + 1 // read, every rename, the record
	if len(rec.calls) != want {
		t.Fatalf("calls=%d want %d", len(rec.calls), want)
	}
	last := rec.calls[len(rec.calls)-1]
	if !strings.Contains(last, "updateOne") || !strings.Contains(last, deployStateCollection) {
		t.Fatalf("last call did not record the version: %s", last)
	}
	if !strings.Contains(last, "version: 1") {
		t.Fatalf("recorded version is not the current one: %s", last)
	}
}

// A database written by a newer binary keeps its version: an older tool must not
// wind it back, or the renames it does not know about would look unapplied.
func TestEnsureRenamesLeavesAheadDatabaseAlone(t *testing.T) {
	t.Parallel()
	rec := &recorder{version: "99"}
	if err := ensureRenamesWith(t.Context(), "cid", creds{}, rec.run); err != nil {
		t.Fatal(err)
	}
	if len(rec.calls) != 1 {
		t.Fatalf("calls=%d want 1 (the version read); got %v", len(rec.calls), rec.calls)
	}
}

// The state collection is the Deployment Tool's own: services never read it, so
// it must not appear in the list mirroring services/shared/mongo/names.go.
func TestDeployStateCollectionIsNotAServiceCollection(t *testing.T) {
	t.Parallel()
	if knownCollections[deployStateCollection] {
		t.Fatalf("%q is listed as a service collection", deployStateCollection)
	}
	if err := requireSafeIdent("deploy state collection", deployStateCollection); err != nil {
		t.Fatal(err)
	}
}
