package models

import (
	"reflect"
	"strings"
	"testing"
)

func TestMetaFieldKeysMatchTheBSONTheyName(t *testing.T) {
	t.Parallel()

	meta := reflect.TypeFor[MetaData]()
	for field, key := range map[string]string{
		"LastModified": MetaFieldLastModified,
		"Owner":        MetaFieldOwner,
		"Revision":     MetaFieldRevision,
		"ClientID":     MetaFieldClientID,
		"SessionID":    MetaFieldSessionID,
	} {
		held, ok := meta.FieldByName(field)
		if !ok {
			t.Fatalf("MetaData has no %s", field)
		}
		if name, _, _ := strings.Cut(held.Tag.Get("bson"), ","); name != key {
			t.Errorf("MetaData.%s is stored as %q, its constant names %q", field, name, key)
		}
	}
}
