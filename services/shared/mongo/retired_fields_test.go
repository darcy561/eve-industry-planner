package mongo

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// retiredFieldPaths are storage fields no document carries any more.
//
// A filter naming one matches nothing and reports no error, and the compiler
// cannot see it: these live in bson.M as string keys. That combination is why a
// rename left ~25 query sites silently broken behind a green build, and why this
// is checked mechanically rather than by review.
var retiredFieldPaths = []string{
	"_meta.accountID",
	"_meta.corporationRef",
	"_meta.allianceRef",
	"owner.kind",
	"owner.id",
}

// retiredFieldExceptions are files that legitimately name a retired field.
//
// Only the migration steps qualify: they read the pre-release shape in order to
// replace it, so the old name is their input rather than a stale query.
var retiredFieldExceptions = map[string]string{
	"core/commands/release_meta_owner.go":  "derives the owner from the account id it is replacing",
	"cmd/mongo_driver_v2_smoke/main.go":    "writes and reads its own throwaway document shape",
	"core/commands/job_identity_encode.go": "runs before the owner stamp in the cutover window, so the account id is all a document carries",
}

func TestNoQueryNamesARetiredField(t *testing.T) {
	t.Parallel()
	root := moduleRoot(t)

	var found []string
	err := filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
		if err != nil || d.IsDir() || !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") {
			return err
		}
		rel, relErr := filepath.Rel(root, path)
		if relErr != nil {
			return relErr
		}
		if _, allowed := retiredFieldExceptions[filepath.ToSlash(rel)]; allowed {
			return nil
		}
		body, readErr := os.ReadFile(path)
		if readErr != nil {
			return readErr
		}
		for _, field := range retiredFieldPaths {
			// Quoted only: a bare mention in prose is a comment, not a query.
			if strings.Contains(string(body), `"`+field+`"`) {
				found = append(found, filepath.ToSlash(rel)+" names "+field)
			}
		}
		return nil
	})
	if err != nil {
		t.Fatalf("walk: %v", err)
	}
	if len(found) > 0 {
		t.Fatalf("retired storage fields are still named in queries:\n  %s\n\nThe owner lives at %s / %s.",
			strings.Join(found, "\n  "), FieldMetaOwnerKind, FieldMetaOwnerID)
	}
}

// moduleRoot walks up to the directory holding go.mod, so the test scans the
// whole module rather than the package it happens to live in.
func moduleRoot(t *testing.T) string {
	t.Helper()
	dir, err := os.Getwd()
	if err != nil {
		t.Fatalf("cwd: %v", err)
	}
	for {
		if _, statErr := os.Stat(filepath.Join(dir, "go.mod")); statErr == nil {
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			t.Fatal("no go.mod above the test")
		}
		dir = parent
	}
}
