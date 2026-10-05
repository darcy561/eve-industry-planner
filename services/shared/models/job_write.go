package models

import (
	"fmt"
	"maps"
	"reflect"
	"slices"
	"strings"
	"sync"

	"encoding/json/jsontext"

	"eve-industry-planner/shared/jsoncodec"

	"go.mongodb.org/mongo-driver/v2/bson"
)

type fieldIndexKey struct {
	t   reflect.Type
	tag string
}

var fieldIndexes sync.Map

// JobWriteBody is one job's write as it arrives.
type JobWriteBody struct {
	JobID    string         `json:"jobID"`
	Revision int64          `json:"revision,omitzero"`
	Document jsontext.Value `json:"document"`
	Removed  [][]string     `json:"removed,omitempty"`
}

// JobDeleteBody is one job a change removes, named with the revision it was read at.
type JobDeleteBody struct {
	JobID    string `json:"jobID"`
	Revision int64  `json:"revision"`
}

// JobWriteBatch is a save request: the writes it carries, the jobs it removes, and whether they
// land as one change, written together or not at all.
type JobWriteBatch struct {
	Jobs      []JobWriteBody  `json:"jobs"`
	Deletes   []JobDeleteBody `json:"deletes,omitempty"`
	OneChange bool            `json:"oneChange,omitzero"`
}

// Validate reports what stops this delete being made: a delete must name its job and the revision
// it was read at.
func (b JobDeleteBody) Validate() error {
	if b.JobID == "" {
		return fmt.Errorf("job delete: a delete named no job")
	}
	if b.Revision <= 0 {
		return fmt.Errorf("job delete: %s names no revision it was read at", b.JobID)
	}
	return nil
}

// Validate reports what stops this batch being written at all: deletes ride only a batch marked
// as one change, and no job is both written and removed.
func (b JobWriteBatch) Validate() error {
	if len(b.Jobs) == 0 && len(b.Deletes) == 0 {
		return fmt.Errorf("job write: a batch carried no jobs")
	}
	if len(b.Deletes) > 0 && !b.OneChange {
		return fmt.Errorf("job write: deletes ride only a batch marked as one change")
	}
	written := make(map[string]bool, len(b.Jobs))
	for _, write := range b.Jobs {
		if err := write.Validate(); err != nil {
			return err
		}
		written[write.JobID] = true
	}
	for _, remove := range b.Deletes {
		if err := remove.Validate(); err != nil {
			return err
		}
		if written[remove.JobID] {
			return fmt.Errorf("job write: %s is both written and removed", remove.JobID)
		}
	}
	return nil
}

// JobIDsOf names the jobs given, leaving out any that carry no id.
func JobIDsOf(jobs []Job) []string {
	ids := make([]string, 0, len(jobs))
	for i := range jobs {
		if jobs[i].JobID != "" {
			ids = append(ids, jobs[i].JobID)
		}
	}
	return ids
}

// JobIDs names every job the batch touches, written or removed.
func (b JobWriteBatch) JobIDs() []string {
	ids := make([]string, 0, len(b.Jobs)+len(b.Deletes))
	for _, write := range b.Jobs {
		ids = append(ids, write.JobID)
	}
	for _, remove := range b.Deletes {
		ids = append(ids, remove.JobID)
	}
	return ids
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
		resolved, err := JobRowPath(path)
		if err != nil {
			return nil, err
		}
		paths = append(paths, resolved)
	}
	return paths, nil
}

// JobRowPath is where a row of one of a job's keyed collections is stored, given the path a client
// names it by.
func JobRowPath(path []string) (string, error) {
	return resolveRowPath(reflect.TypeFor[Job](), path)
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
		if len(at) == 0 && name == MetaFieldName {
			return fmt.Errorf("job write: a body may not carry %s", MetaFieldName)
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
		return storedTagName(field), held.FieldByIndex(field.Index), nil
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
			if len(stored) == 0 && segment == MetaFieldName {
				return "", fmt.Errorf("job write: a body may not remove from %s", MetaFieldName)
			}
			field, ok := fieldByJSONName(t, segment)
			if !ok {
				return "", fmt.Errorf("job write: %q is not a field of %s", segment, t.Name())
			}
			name := storedTagName(field)
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
	field, ok := fieldsNamedBy(t, "json", jsonTagName)[name]
	return field, ok
}

// fieldsNamedBy indexes a struct's fields by the name one tag gives them,
// reading through an embedded struct and built once per type and tag.
func fieldsNamedBy(t reflect.Type, tag string, nameOf func(reflect.StructField) string) map[string]reflect.StructField {
	key := fieldIndexKey{t: t, tag: tag}
	if held, ok := fieldIndexes.Load(key); ok {
		return held.(map[string]reflect.StructField)
	}
	index := map[string]reflect.StructField{}
	indexFields(t, nameOf, nil, index)
	fieldIndexes.Store(key, index)
	return index
}

func indexFields(t reflect.Type, nameOf func(reflect.StructField) string, at []int, index map[string]reflect.StructField) {
	for field := range t.Fields() {
		field.Index = append(append([]int{}, at...), field.Index...)
		name := nameOf(field)
		if name == "" {
			if field.Anonymous {
				indexFields(derefType(field.Type), nameOf, field.Index, index)
			}
			continue
		}
		if _, held := index[name]; !held {
			index[name] = field
		}
	}
}

// jsonTagName is the name a field's json tag gives it, empty where it names none.
func jsonTagName(field reflect.StructField) string {
	name, _, _ := strings.Cut(field.Tag.Get("json"), ",")
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

// EntityRefIDKey names the client field a stored ref stands in for, reporting
// whether the key names a ref at all.
func EntityRefIDKey(key string) (string, bool) {
	if base, ok := strings.CutSuffix(key, "_ref"); ok && base != "" {
		return base + "_id", true
	}
	if base, ok := strings.CutSuffix(key, "Ref"); ok && base != "" {
		return base + "ID", true
	}
	return "", false
}

// JobJSONChange is one path a stored change set whole, in the names a client
// reads, with the value it now holds there.
type JobJSONChange struct {
	Path  []string `json:"path"`
	Value any      `json:"value"`
}

// JobJSONChanges turns each path a stored change set into the path a client
// replaces at, refusing a ref set on its own since only a row carries one across.
func JobJSONChanges(updatedFields map[string]any) ([]JobJSONChange, error) {
	changes := make([]JobJSONChange, 0, len(updatedFields))
	for _, stored := range slices.Sorted(maps.Keys(updatedFields)) {
		path, at, err := storedPathToJSON(reflect.TypeFor[Job](), strings.Split(stored, "."))
		if err != nil {
			return nil, err
		}
		if path == nil {
			continue
		}
		if err := refusePathEndingInRef(path); err != nil {
			return nil, err
		}
		value, err := storedValueToJSON(at, updatedFields[stored])
		if err != nil {
			return nil, err
		}
		changes = append(changes, JobJSONChange{Path: path, Value: value})
	}
	return changes, nil
}

// JobJSONRemoved turns each cleared stored path into the path a client deletes at.
func JobJSONRemoved(removed []string) ([][]string, error) {
	paths := make([][]string, 0, len(removed))
	for _, stored := range removed {
		path, _, err := storedPathToJSON(reflect.TypeFor[Job](), strings.Split(stored, "."))
		if err != nil {
			return nil, err
		}
		if path == nil {
			continue
		}
		if err := refusePathEndingInRef(path); err != nil {
			return nil, err
		}
		paths = append(paths, path)
	}
	return paths, nil
}

// storedPathToJSON walks a stored path to the one a client reads and the type it
// lands on, answering a nil path for a field a client is never sent.
func storedPathToJSON(t reflect.Type, stored []string) ([]string, reflect.Type, error) {
	path := make([]string, 0, len(stored))
	for _, segment := range stored {
		t = derefType(t)
		switch t.Kind() {
		case reflect.Struct:
			field, ok := fieldByBSONName(t, segment)
			if !ok {
				return nil, nil, fmt.Errorf("job delta: %q is not a stored field of %s", segment, t.Name())
			}
			name, sent := clientName(field, segment)
			if !sent {
				return nil, nil, nil
			}
			path = append(path, name)
			t = field.Type
		case reflect.Map:
			if err := usableAsKey(segment); err != nil {
				return nil, nil, err
			}
			path = append(path, segment)
			t = t.Elem()
		default:
			return nil, nil, fmt.Errorf("job delta: %q cannot be stepped into", segment)
		}
	}
	return path, t, nil
}

// storedValueToJSON renames the keys inside a delta's value, which are stored
// names wherever the value is a document or holds one.
func storedValueToJSON(t reflect.Type, value any) (any, error) {
	t = derefType(t)
	switch t.Kind() {
	case reflect.Struct:
		document := asDocument(value)
		if document == nil {
			return value, nil
		}
		out := make(map[string]any, len(document))
		for _, key := range slices.Sorted(maps.Keys(document)) {
			field, ok := fieldByBSONName(t, key)
			if !ok {
				return nil, fmt.Errorf("job delta: %q is not a stored field of %s", key, t.Name())
			}
			name, sent := clientName(field, key)
			if !sent {
				continue
			}
			inner, err := storedValueToJSON(field.Type, document[key])
			if err != nil {
				return nil, err
			}
			out[name] = inner
		}
		return out, nil
	case reflect.Map:
		document := asDocument(value)
		if document == nil {
			return value, nil
		}
		out := make(map[string]any, len(document))
		for key, row := range document {
			if err := usableAsKey(key); err != nil {
				return nil, err
			}
			inner, err := storedValueToJSON(t.Elem(), row)
			if err != nil {
				return nil, err
			}
			out[key] = inner
		}
		return out, nil
	case reflect.Slice, reflect.Array:
		items := asArray(value)
		if items == nil {
			return value, nil
		}
		out := make([]any, 0, len(items))
		for _, item := range items {
			inner, err := storedValueToJSON(t.Elem(), item)
			if err != nil {
				return nil, err
			}
			out = append(out, inner)
		}
		return out, nil
	default:
		return value, nil
	}
}

// clientName is the name a stored field reaches a client under, reporting whether
// it reaches one at all. A ref keeps its stored name for the id restore to rewrite.
func clientName(field reflect.StructField, stored string) (string, bool) {
	name, _, _ := strings.Cut(field.Tag.Get("json"), ",")
	if name == "-" {
		if _, isRef := EntityRefIDKey(stored); isRef {
			return stored, true
		}
		return "", false
	}
	if name == "" {
		return field.Name, true
	}
	return name, true
}

// refusePathEndingInRef refuses a path whose last step is a ref, which reaches a
// client as ciphertext because the id restore rewrites keys inside a row only.
func refusePathEndingInRef(path []string) error {
	if _, isRef := EntityRefIDKey(path[len(path)-1]); isRef {
		return fmt.Errorf("job delta: %s names a ref on its own", strings.Join(path, "."))
	}
	return nil
}

// fieldByBSONName finds the field a stored name refers to.
func fieldByBSONName(t reflect.Type, name string) (reflect.StructField, bool) {
	field, ok := fieldsNamedBy(t, "bson", storedTagName)[name]
	return field, ok
}

// storedTagName is the name a field is stored under, empty where it is not
// stored and where an embedded struct spreads its fields into this one.
func storedTagName(field reflect.StructField) string {
	name, _, _ := strings.Cut(field.Tag.Get("bson"), ",")
	if name == "-" {
		return ""
	}
	if name == "" && field.Anonymous {
		return ""
	}
	if name == "" {
		return strings.ToLower(field.Name)
	}
	return name
}

// asDocument reads a stored value as a document, answering nil for anything else.
func asDocument(value any) map[string]any {
	switch v := value.(type) {
	case map[string]any:
		return v
	case bson.M:
		return v
	case bson.D:
		out := make(map[string]any, len(v))
		for _, entry := range v {
			out[entry.Key] = entry.Value
		}
		return out
	default:
		return nil
	}
}

// asArray reads a stored value as a list, answering nil for anything else.
func asArray(value any) []any {
	switch v := value.(type) {
	case []any:
		return v
	case bson.A:
		return v
	default:
		return nil
	}
}
