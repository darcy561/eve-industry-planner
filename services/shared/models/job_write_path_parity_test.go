package models

import (
	"reflect"
	"strings"
	"testing"
)

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
