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

// A job write says which fields it carries and which rows went, and the model
// itself decides what either may reach.
//
// The body names no stored path. `Document` is a partial job — a field that is
// present is being written, a field that is absent is unchanged — and `Removed`
// names each row that went as the path into the job it sat at. Both are walked
// over [Job] here: a name that is not a field of the model, or a row path that
// does not end at a key of one of its collections, is refused before a write is
// built, and the stored path comes from the bson tags rather than from the body.
//
// The two are derived from different things on purpose. Presence can only be
// read from the raw JSON, since a decoded zero value and an absent field look
// alike; the values written come from the decoded job, so what reaches the
// database has been through the model's own decoding and whatever the handler
// did to it after.

// metaFieldJSONName is the one field a body may never carry: the server states
// a document's owner, revision and stamps, and a body that could name them
// would be naming where the write lands rather than what it holds.
const metaFieldJSONName = "_meta"

// JobWriteBody is a field-scoped write as it arrives.
type JobWriteBody struct {
	Document jsontext.Value `json:"document"`
	Removed  [][]string     `json:"removed,omitempty"`
}

// JobSetPaths pairs each field the body carried with the value the decoded job
// holds for it, keyed by its stored path.
//
// job is the body's own document after decoding, so a field the handler rewrote
// — a ciphered id, a stamped schema version — is written as the handler left it.
//
// The path emitted is the deepest present field, except where a field has no
// stored path of its own: that promotes the write to the row containing it.
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
//
// A path is resolved against [Job] one segment at a time — a segment names a
// field, and a segment after a map names one of that map's keys — so a path that
// leaves the model is refused. It must end at a map key: a struct field is not a
// row, and clearing one would store a job that cannot be read back.
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
	// Every member is resolved before any is written, because one of them may
	// decide the write for all of them: a field with no stored path of its own
	// promotes the write to the row holding it, and that has to be the answer
	// whichever order the members are read in.
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

	// A field the server rewrites into a sibling — a ciphered id — is written by
	// writing the row it sits in, which carries whatever else that row changed.
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
		key := reflect.ValueOf(name)
		if !key.Type().AssignableTo(held.Type().Key()) {
			return "", reflect.Value{}, fmt.Errorf("job write: %s is not keyed by name", held.Type())
		}
		row := held.MapIndex(key)
		if !row.IsValid() {
			// The decoded job does not hold what the body said was present, which
			// is a body the model read differently from the client that wrote it.
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
			stored = append(stored, segment)
			t = t.Elem()
			fromMap = true
		default:
			return "", fmt.Errorf("job write: %q cannot be reached into", segment)
		}
	}
	// Only a row of a keyed collection can be cleared on its own. A struct field
	// is part of the job's shape, and a list row cleared by path leaves a hole.
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
