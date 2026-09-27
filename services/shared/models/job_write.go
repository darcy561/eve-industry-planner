package models

import (
	"fmt"
	"maps"
	"reflect"
	"slices"
	"strings"

	"encoding/json/jsontext"

	"eve-industry-planner/shared/jsoncodec"
)

// metaFieldJSONName is the one field a body may never carry, because the server
// states a document's owner, revision and stamps.
const metaFieldJSONName = "_meta"

// JobWriteBody is one job's write as it arrives.
type JobWriteBody struct {
	JobID    string `json:"jobID"`
	Revision int64  `json:"revision,omitzero"`
	// IncludedInGroup and GroupID are what the lock gate asks about, stated here
	// because it asks before any document is decoded.
	IncludedInGroup bool           `json:"includedInGroup,omitzero"`
	GroupID         string         `json:"groupID,omitzero"`
	Document        jsontext.Value `json:"document"`
	Removed         [][]string     `json:"removed,omitempty"`
}

// IsWholeDocument reports whether this write carries the whole job rather than
// the fields it changed.
func (b JobWriteBody) IsWholeDocument() bool { return b.Revision <= 0 }

// Validate reports what stops this write being made at all, before a batch is
// walked or a lock asked about.
func (b JobWriteBody) Validate() error {
	if b.JobID == "" {
		return fmt.Errorf("job write: a write named no job")
	}
	if len(b.Document) == 0 {
		return fmt.Errorf("job write: %s carries no document", b.JobID)
	}
	if b.Revision < 0 {
		return fmt.Errorf("job write: %s names a revision below zero", b.JobID)
	}
	return nil
}

// JobSetPaths pairs each field the body carried with the value the decoded job
// holds for it, keyed by its stored path.
func JobSetPaths(document jsontext.Value, job *Job) (map[string]any, error) {
	if job == nil {
		return nil, fmt.Errorf("job write: no decoded job to read values from")
	}
	present, err := objectMembers(document)
	if err != nil {
		return nil, err
	}
	set := map[string]any{}
	if err := walkSet(present, reflect.ValueOf(*job), nil, set); err != nil {
		return nil, err
	}
	return set, nil
}

// JobUnsetPaths turns each removed row into the stored path that clears it.
func JobUnsetPaths(removed [][]string) ([]string, error) {
	paths := make([]string, 0, len(removed))
	for _, path := range removed {
		resolved, err := resolveRowPath(reflect.TypeFor[Job](), path)
		if err != nil {
			return nil, err
		}
		paths = append(paths, resolved)
	}
	return paths, nil
}

func walkSet(present map[string]jsontext.Value, held reflect.Value, at []string, set map[string]any) error {
	type member struct {
		name   string
		stored string
		value  reflect.Value
	}
	resolved := make([]member, 0, len(present))
	promote := false
	for _, name := range slices.Sorted(maps.Keys(present)) {
		if len(at) == 0 && name == metaFieldJSONName {
			return fmt.Errorf("job write: a body may not carry %s", metaFieldJSONName)
		}
		stored, value, err := memberOf(held, name)
		if err != nil {
			return err
		}
		if stored == "" {
			if len(at) == 0 {
				return fmt.Errorf("job write: %s has no stored path and no row to be written with", name)
			}
			promote = true
		}
		resolved = append(resolved, member{name, stored, value})
	}

	if promote {
		set[strings.Join(at, ".")] = held.Interface()
		return nil
	}

	for _, m := range resolved {
		path := append(append([]string{}, at...), m.stored)
		inner := documentMembers(present[m.name])
		if len(inner) == 0 {
			set[strings.Join(path, ".")] = m.value.Interface()
			continue
		}
		if err := walkSet(inner, m.value, path, set); err != nil {
			return err
		}
	}
	return nil
}

// memberOf finds what a json name refers to on the value holding it, and says
// where that is stored. An empty stored name means the field has none.
func memberOf(held reflect.Value, name string) (stored string, value reflect.Value, err error) {
	held = deref(held)
	switch held.Kind() {
	case reflect.Struct:
		field, ok := fieldByJSONName(held.Type(), name)
		if !ok {
			return "", reflect.Value{}, fmt.Errorf("job write: %q is not a field of %s", name, held.Type().Name())
		}
		return bsonName(field), held.FieldByIndex(field.Index), nil
	case reflect.Map:
		if err := usableAsKey(name); err != nil {
			return "", reflect.Value{}, err
		}
		key := reflect.ValueOf(name)
		if !key.Type().AssignableTo(held.Type().Key()) {
			return "", reflect.Value{}, fmt.Errorf("job write: %s is not keyed by name", held.Type())
		}
		row := held.MapIndex(key)
		if !row.IsValid() {
			return "", reflect.Value{}, fmt.Errorf("job write: the decoded job has no %q", name)
		}
		return name, row, nil
	default:
		return "", reflect.Value{}, fmt.Errorf("job write: cannot reach into %s", held.Kind())
	}
}

func resolveRowPath(t reflect.Type, path []string) (string, error) {
	if len(path) == 0 {
		return "", fmt.Errorf("job write: a removed row named no path")
	}
	stored := make([]string, 0, len(path))
	fromMap := false
	for _, segment := range path {
		t = derefType(t)
		switch t.Kind() {
		case reflect.Struct:
			if len(stored) == 0 && segment == metaFieldJSONName {
				return "", fmt.Errorf("job write: a body may not remove from %s", metaFieldJSONName)
			}
			field, ok := fieldByJSONName(t, segment)
			if !ok {
				return "", fmt.Errorf("job write: %q is not a field of %s", segment, t.Name())
			}
			name := bsonName(field)
			if name == "" {
				return "", fmt.Errorf("job write: %q has no stored path", segment)
			}
			stored = append(stored, name)
			t = field.Type
			fromMap = false
		case reflect.Map:
			if err := usableAsKey(segment); err != nil {
				return "", err
			}
			stored = append(stored, segment)
			t = t.Elem()
			fromMap = true
		default:
			return "", fmt.Errorf("job write: %q cannot be reached into", segment)
		}
	}
	if !fromMap {
		return "", fmt.Errorf("job write: %s is not a row of a keyed collection", strings.Join(path, "."))
	}
	return strings.Join(stored, "."), nil
}

// documentMembers is objectMembers for a value that may legitimately be a leaf.
func documentMembers(raw jsontext.Value) map[string]jsontext.Value {
	if len(raw) == 0 || raw.Kind() != '{' {
		return nil
	}
	members, err := objectMembers(raw)
	if err != nil {
		return nil
	}
	return members
}

// usableAsKey refuses a row key that cannot be written as a stored path: one
// holding a dot, or an empty one.
func usableAsKey(name string) error {
	if name == "" {
		return fmt.Errorf("job write: a row was named by an empty key")
	}
	if strings.Contains(name, ".") {
		return fmt.Errorf("job write: %q cannot be a row key", name)
	}
	return nil
}

func objectMembers(raw jsontext.Value) (map[string]jsontext.Value, error) {
	if len(raw) == 0 {
		return nil, nil
	}
	if raw.Kind() != '{' {
		return nil, fmt.Errorf("job write: %s is not a document", raw.Kind())
	}
	var members map[string]jsontext.Value
	if err := jsoncodec.Unmarshal(raw, &members); err != nil {
		return nil, fmt.Errorf("job write: %w", err)
	}
	return members, nil
}

func fieldByJSONName(t reflect.Type, name string) (reflect.StructField, bool) {
	for field := range t.Fields() {
		tag, _, _ := strings.Cut(field.Tag.Get("json"), ",")
		if tag == name {
			return field, true
		}
		if tag == "" && field.Anonymous {
			if inner, ok := fieldByJSONName(derefType(field.Type), name); ok {
				inner.Index = append(append([]int{}, field.Index...), inner.Index...)
				return inner, true
			}
		}
	}
	return reflect.StructField{}, false
}

func bsonName(field reflect.StructField) string {
	name, _, _ := strings.Cut(field.Tag.Get("bson"), ",")
	if name == "-" {
		return ""
	}
	if name == "" {
		return strings.ToLower(field.Name)
	}
	return name
}

func deref(v reflect.Value) reflect.Value {
	for v.Kind() == reflect.Pointer || v.Kind() == reflect.Interface {
		if v.IsNil() {
			return v
		}
		v = v.Elem()
	}
	return v
}

func derefType(t reflect.Type) reflect.Type {
	for t.Kind() == reflect.Pointer {
		t = t.Elem()
	}
	return t
}
