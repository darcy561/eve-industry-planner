package sde_test

import (
	"go/ast"
	"go/parser"
	"go/token"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// A build change that reaches the services must also reach the browsers.
//
// The two announcements are separate: PublishSDEBuildUpdated is the internal
// event the API cache and the core metric derive from, and
// AnnounceStaticDataBuild is what tells connected clients. A site that sends
// only the first leaves every open session on the previous build until its next
// load, and nothing fails — which is why this is checked rather than left to
// whoever adds the third site.
//
// Checked in the source because the seam is not reachable otherwise: both take a
// concrete *nats.NATS, and the surrounding work needs S3, so neither call can be
// faked from here.
func TestEverySDEBuildAnnouncementAlsoReachesClients(t *testing.T) {
	const (
		internal = "PublishSDEBuildUpdated"
		toClient = "AnnounceStaticDataBuild"
	)

	sites := 0
	err := filepath.WalkDir(".", func(path string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() || !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") {
			return err
		}
		src, rerr := os.ReadFile(path)
		if rerr != nil {
			return rerr
		}
		fset := token.NewFileSet()
		file, perr := parser.ParseFile(fset, path, src, 0)
		if perr != nil {
			return perr
		}

		for _, decl := range file.Decls {
			fn, ok := decl.(*ast.FuncDecl)
			if !ok || fn.Body == nil {
				continue
			}
			called := map[string]bool{}
			ast.Inspect(fn.Body, func(n ast.Node) bool {
				if sel, ok := n.(*ast.SelectorExpr); ok {
					called[sel.Sel.Name] = true
				}
				return true
			})
			if !called[internal] {
				continue
			}
			sites++
			if !called[toClient] {
				t.Errorf("%s calls %s without %s, so this build change never reaches a connected client",
					fn.Name.Name, internal, toClient)
			}
		}
		return nil
	})
	if err != nil {
		t.Fatalf("walk: %v", err)
	}

	// A rename that made the calls invisible here would otherwise pass silently.
	if sites < 2 {
		t.Fatalf("found %d site(s) announcing a build change, want the update and rollback paths", sites)
	}
}
