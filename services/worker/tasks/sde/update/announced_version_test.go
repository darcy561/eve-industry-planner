package update

import (
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Every announcement must carry the root version read *after* the publish
// pipeline ran.
//
// A rebuild republishes the same build under a new version label, so a copy read
// before the pipeline names the build that was just replaced. A client told that
// label compares it against the one it already holds, decides it is current, and
// never fetches the files that actually changed — the announcement arrives and
// does nothing, which is worse than not sending one.
//
// Checked in the source because the seam is not reachable otherwise: the publish
// takes a concrete *nats.NATS, and this package's store-backed tests need S3, so
// neither the call nor the pipeline can be faked here.
func TestAnnouncementsCarryThePostPipelineVersion(t *testing.T) {
	files, err := filepath.Glob("*.go")
	if err != nil {
		t.Fatalf("glob: %v", err)
	}

	found := 0
	for _, path := range files {
		if strings.HasSuffix(path, "_test.go") {
			continue
		}
		src, err := os.ReadFile(path)
		if err != nil {
			t.Fatalf("read %s: %v", path, err)
		}
		fset := token.NewFileSet()
		file, err := parser.ParseFile(fset, path, src, 0)
		if err != nil {
			t.Fatalf("parse %s: %v", path, err)
		}

		ast.Inspect(file, func(n ast.Node) bool {
			call, ok := n.(*ast.CallExpr)
			if !ok {
				return true
			}
			ident, ok := call.Fun.(*ast.Ident)
			if !ok || ident.Name != "pushCoreSDEBuildUpdate" || len(call.Args) < 4 {
				return true
			}
			found++

			// Args are (ctx, deps, buildNumber, version); both figures must come
			// off the same freshly-read version, so a selector such as
			// liveVersion.BuildNumber is what is expected here.
			buildArg, bok := call.Args[2].(*ast.SelectorExpr)
			versionArg, vok := call.Args[3].(*ast.SelectorExpr)
			if !bok || !vok {
				return true
			}
			buildFrom, bok := buildArg.X.(*ast.Ident)
			versionFrom, vok := versionArg.X.(*ast.Ident)
			if !bok || !vok {
				return true
			}
			if buildFrom.Name != versionFrom.Name {
				t.Errorf("%s:%d: announces %s.%s with %s.%s — the build and the version must come off one read",
					path, fset.Position(call.Pos()).Line,
					buildFrom.Name, buildArg.Sel.Name, versionFrom.Name, versionArg.Sel.Name)
			}
			if strings.EqualFold(buildFrom.Name, "rootVersion") {
				t.Errorf("%s:%d: announces %s, which is read before the publish pipeline runs; "+
					"re-read the root version after it and announce that",
					path, fset.Position(call.Pos()).Line, buildFrom.Name)
			}
			return true
		})
	}

	if found == 0 {
		t.Fatal("no pushCoreSDEBuildUpdate calls found: this guard is checking nothing")
	}
}
