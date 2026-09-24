package models

import (
	"reflect"
	"strings"
	"testing"
)

// A field-scoped write names stored paths, and the names it uses are read from
// the model's own bson tags everywhere but two: the schema version and the
// account a write is stamped with, which are written by constants because the
// walk never visits them. A constant is a copy, and a copy can fall behind the
// tag it restates — silently, because a write to a path nothing reads fails at
// nothing. These pin the two together.
func storedNameOf(t *testing.T, held any, field string) string {
	t.Helper()
	found, ok := reflect.TypeOf(held).FieldByName(field)
	if !ok {
		t.Fatalf("%T has no field %s", held, field)
	}
	name, _, _ := strings.Cut(found.Tag.Get("bson"), ",")
	return name
}

func TestJobSchemaVersionPathIsTheModelsOwnName(t *testing.T) {
	if got := storedNameOf(t, Job{}, "SchemaVersion"); got != JobSchemaVersionPath {
		t.Errorf("JobSchemaVersionPath is %q, the model stores it at %q", JobSchemaVersionPath, got)
	}
}

func TestMetaFieldLastUpdatedByIsTheModelsOwnName(t *testing.T) {
	if got := storedNameOf(t, JobMetaData{}, "LastUpdatedBy"); got != MetaFieldLastUpdatedBy {
		t.Errorf("MetaFieldLastUpdatedBy is %q, the model stores it at %q", MetaFieldLastUpdatedBy, got)
	}
}

func TestMetaFieldRevisionIsTheModelsOwnName(t *testing.T) {
	if got := storedNameOf(t, MetaData{}, "Revision"); got != MetaFieldRevision {
		t.Errorf("MetaFieldRevision is %q, the model stores it at %q", MetaFieldRevision, got)
	}
}

func TestMetaFieldOwnerIsTheModelsOwnName(t *testing.T) {
	if got := storedNameOf(t, MetaData{}, "Owner"); got != MetaFieldOwner {
		t.Errorf("MetaFieldOwner is %q, the model stores it at %q", MetaFieldOwner, got)
	}
}
