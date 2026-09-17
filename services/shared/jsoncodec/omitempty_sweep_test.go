package jsoncodec_test

import (
	"go/ast"
	"go/parser"
	"go/token"
	"reflect"
	"sort"
	"strconv"
	"strings"
	"testing"

	"eve-industry-planner/testing/gosource"
)

// zeroIsWritten names the Go types whose zero value `omitempty` does not omit.
//
// The tag omits an empty JSON value — null, "", {} and [] — so it covers strings,
// pointers, slices and maps, and does nothing at all for a number or a bool. A
// field tagged omitempty whose type is one of these is therefore a tag that reads
// as a wish and behaves as nothing: the zero is written every time.
var zeroIsWritten = map[string]bool{
	"int": true, "int8": true, "int16": true, "int32": true, "int64": true,
	"uint": true, "uint8": true, "uint16": true, "uint32": true, "uint64": true,
	"float32": true, "float64": true, "bool": true,
}

// keptOmitempty are the fields deliberately left on omitempty, each with the
// reason the zero cannot reach a document or must be written when it does.
//
// Everything else takes omitzero, so a field whose zero means "not set yet" is
// absent from the encoded document rather than asserted as a value. Adding a
// field here is a claim about the data, not a way to silence the sweep.
var keptOmitempty = map[string]string{
	// A release step normalises a missing or 0 schemaVersion to 1 and the write
	// path seeds revision, so no stored document holds the zero. Omitting them
	// would also hide the one case worth seeing if that ever regressed.
	"shared/models/accountDocuments.go:ApplicationSettings.SchemaVersion":      "normalised to >= 1 before release",
	"shared/models/group.go:Group.SchemaVersion":                               "normalised to >= 1 before release",
	"shared/models/job.go:Job.SchemaVersion":                                   "normalised to >= 1 before release",
	"shared/models/user_account_document.go:UserAccountDocument.SchemaVersion": "normalised to >= 1 before release",
	"shared/models/metaData.go:MetaData.Revision":                              "seeded at 1 by the write path",
	"shared/models/planner/planner_documents.go:Planner.SchemaVersion":         "every construction sets SchemaCurrent",
	"shared/models/planner/planner_documents.go:Membership.SchemaVersion":      "every construction sets SchemaCurrent",
	"shared/models/planner/settings.go:Settings.SchemaVersion":                 "every construction sets SchemaCurrent",
}

func TestScalarFieldsDoNotClaimOmitempty(t *testing.T) {
	t.Parallel()

	var found []string
	fset := token.NewFileSet()
	gosource.EachFile(t, gosource.ModuleRoot(t), func(rel string, body []byte) {
		if strings.HasSuffix(rel, "_test.go") {
			return
		}
		file, err := parser.ParseFile(fset, rel, body, 0)
		if err != nil {
			t.Fatalf("parse %s: %v", rel, err)
		}
		ast.Inspect(file, func(n ast.Node) bool {
			spec, ok := n.(*ast.TypeSpec)
			if !ok {
				return true
			}
			st, ok := spec.Type.(*ast.StructType)
			if !ok {
				return true
			}
			for _, fld := range st.Fields.List {
				name, ok := scalarOmitempty(fld)
				if !ok {
					continue
				}
				found = append(found, rel+":"+spec.Name.Name+"."+name)
			}
			return true
		})
	})

	var unexpected []string
	for _, f := range found {
		if _, kept := keptOmitempty[f]; !kept {
			unexpected = append(unexpected, f)
		}
	}
	sort.Strings(unexpected)
	if len(unexpected) > 0 {
		t.Fatalf("numeric and bool fields tagged json omitempty, which writes the zero rather than omitting it:\n  %s\n\nUse omitzero, or record the field in keptOmitempty with the reason its zero cannot reach a document.",
			strings.Join(unexpected, "\n  "))
	}

	held := map[string]bool{}
	for _, f := range found {
		held[f] = true
	}
	for f := range keptOmitempty {
		if !held[f] {
			t.Errorf("keptOmitempty names %s, which no longer carries a scalar json omitempty tag — drop the entry", f)
		}
	}
}

// scalarOmitempty reports the field's name when it carries a json omitempty tag
// on a type whose zero that tag cannot omit. Embedded fields are skipped: they
// have no name of their own and carry the tag of the type they promote.
func scalarOmitempty(fld *ast.Field) (string, bool) {
	if fld.Tag == nil || len(fld.Names) == 0 {
		return "", false
	}
	raw, err := strconv.Unquote(fld.Tag.Value)
	if err != nil {
		return "", false
	}
	if !strings.Contains(reflect.StructTag(raw).Get("json"), ",omitempty") {
		return "", false
	}
	ident, ok := fld.Type.(*ast.Ident)
	if !ok || !zeroIsWritten[ident.Name] {
		return "", false
	}
	return fld.Names[0].Name, true
}
