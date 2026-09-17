package jsoncodec_test

import (
	"bytes"
	jsonv1 "encoding/json"
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"

	"eve-industry-planner/shared/jsoncodec"
	"eve-industry-planner/shared/models"
)

// A call site can only move here if what it emits does not change, so the
// representative documents are encoded both ways and the bytes compared.
//
// They carry the schema version and revision a stored document carries. A zero
// value struct is not a document: `schemaVersion` is normalised to at least 1 by
// the release step, and `revision` is seeded at InitialDocumentRevision, so
// comparing zero values would report a difference no wire ever sees.
func TestMarshalMatchesV1ExceptEmptyCollections(t *testing.T) {
	t.Parallel()

	user := models.UserAccountDocument{
		SchemaVersion: models.UserAccountDocumentSchemaCurrent,
	}
	user.MetaData.Revision = models.InitialDocumentRevision
	stats := models.ArchivedJobStats{
		SchemaVersion: models.ArchivedJobStatsSchemaCurrent,
	}

	for _, tc := range []struct {
		name string
		v    any
	}{
		{"UserAccountDocument", user},
		{"ArchivedJobStats", stats},
		{"nil slice, nil map, empty slice, HTML, unordered map", struct {
			S []string          `json:"s"`
			M map[string]int    `json:"m"`
			E []string          `json:"e"`
			T time.Time         `json:"t"`
			H string            `json:"h"`
			N map[string]string `json:"n"`
		}{E: []string{}, H: "a<b>c&d", N: map[string]string{"z": "1", "a": "2"}}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			assertMatchesV1ExceptEmptyCollections(t, tc.v)
		})
	}
}

// The reason to be here at all. v1 took the last duplicate and replaced invalid
// UTF-8 with U+FFFD; each turned a malformed document into a plausible one.
func TestReadsAreStrict(t *testing.T) {
	t.Parallel()

	type doc struct {
		JobID string `json:"jobID"`
	}

	for _, tc := range []struct{ name, in string }{
		{"duplicate name", `{"jobID":"a","jobID":"b"}`},
		{"invalid UTF-8", "{\"jobID\":\"\xff\"}"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			var out doc
			if err := jsoncodec.Unmarshal([]byte(tc.in), &out); err == nil {
				t.Fatalf("accepted %s, decoding to %+v", tc.in, out)
			}
		})
	}
}

// Case sensitivity drops a mismatched field rather than refusing the document.
// v1 would have matched JOBID to jobID; v2 does not, and says nothing. A caller
// that wants the refusal asks for it, which is what the one DisallowUnknownFields
// site in the API does today — moving that site here must keep it.
func TestFieldCaseIsSilentlyUnmatched(t *testing.T) {
	t.Parallel()

	var out struct {
		JobID string `json:"jobID"`
	}
	if err := jsoncodec.Unmarshal([]byte(`{"JOBID":"a"}`), &out); err != nil {
		t.Fatalf("a case-mismatched field should be ignored, not an error: %v", err)
	}
	if out.JobID != "" {
		t.Fatalf("JOBID matched jobID: %q", out.JobID)
	}
}

// Encode stands in for json.NewEncoder(w).Encode(v), which is how every JSON
// response is written today, so it has to put the same bytes on the wire —
// including the trailing newline MarshalWrite leaves off.
func TestEncodeIsMarshalPlusTheNewline(t *testing.T) {
	t.Parallel()

	user := models.UserAccountDocument{
		SchemaVersion: models.UserAccountDocumentSchemaCurrent,
	}
	user.MetaData.Revision = models.InitialDocumentRevision

	for _, tc := range []struct {
		name string
		v    any
	}{
		{"UserAccountDocument", user},
		{"map", map[string]int{"b": 2, "a": 1}},
		{"nil slice", struct {
			S []string `json:"s"`
		}{}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			var got bytes.Buffer
			if err := jsoncodec.Encode(&got, tc.v); err != nil {
				t.Fatalf("encode: %v", err)
			}
			// The newline is the part Encode adds and MarshalWrite does not.
			if !strings.HasSuffix(got.String(), "\n") {
				t.Fatalf("no trailing newline: %q", got.String())
			}
			if strings.Count(got.String(), "\n") != 1 {
				t.Fatalf("expected exactly one newline: %q", got.String())
			}
			// The body is Marshal's, which the sweeps above hold against v1.
			marshalled, err := jsoncodec.Marshal(tc.v)
			if err != nil {
				t.Fatal(err)
			}
			if got.String() != string(marshalled)+"\n" {
				t.Fatalf("Encode and Marshal disagree\n Encode: %q\nMarshal: %q", got.String(), marshalled)
			}
		})
	}
}

// Decode stands in for json.NewDecoder(r).Decode(v), and reads under the same
// strictness as Unmarshal rather than a looser one.
func TestDecodeReadsAndIsStrict(t *testing.T) {
	t.Parallel()

	type doc struct {
		JobID string `json:"jobID"`
	}

	var out doc
	if err := jsoncodec.Decode(strings.NewReader(`{"jobID":"a"}`), &out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if out.JobID != "a" {
		t.Fatalf("jobID = %q, want a", out.JobID)
	}

	var dup doc
	if err := jsoncodec.Decode(strings.NewReader(`{"jobID":"a","jobID":"b"}`), &dup); err == nil {
		t.Fatalf("a duplicate name was accepted, decoding to %+v", dup)
	}
}

// What Marshal writes, Unmarshal reads back.
func TestRoundTrip(t *testing.T) {
	t.Parallel()

	in := models.UserAccountDocument{
		SchemaVersion: models.UserAccountDocumentSchemaCurrent,
	}
	in.MetaData.Revision = models.InitialDocumentRevision

	raw, err := jsoncodec.Marshal(in)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var out models.UserAccountDocument
	if err := jsoncodec.Unmarshal(raw, &out); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	again, err := jsoncodec.Marshal(out)
	if err != nil {
		t.Fatalf("re-marshal: %v", err)
	}
	if string(again) != string(raw) {
		t.Fatalf("round trip changed the bytes\n in: %s\nout: %s", raw, again)
	}
}

// failingWriter refuses after n bytes, so Encode's write path can be checked.
type failingWriter struct {
	n   int
	err error
}

func (f *failingWriter) Write(p []byte) (int, error) {
	if f.n <= 0 {
		return 0, f.err
	}
	if len(p) > f.n {
		p, f.n = p[:f.n], 0
		return len(p), f.err
	}
	f.n -= len(p)
	return len(p), nil
}

// A write that fails is reported rather than swallowed — including one that
// fails only on the trailing newline, which is written separately and would
// otherwise be the one byte nobody checked.
func TestEncodeReportsAWriteFailure(t *testing.T) {
	t.Parallel()

	boom := errors.New("disk on fire")

	if err := jsoncodec.Encode(&failingWriter{n: 0, err: boom}, map[string]int{"x": 1}); err == nil {
		t.Fatal("a writer that refuses everything encoded without error")
	}
	// {"x":1} is 7 bytes; allowing exactly that fails on the newline alone.
	if err := jsoncodec.Encode(&failingWriter{n: 7, err: boom}, map[string]int{"x": 1}); err == nil {
		t.Fatal("a writer that fails on the trailing newline encoded without error")
	}

	if err := jsoncodec.Encode(&bytes.Buffer{}, make(chan int)); err == nil {
		t.Fatal("a channel encoded without error")
	}
}

// The whole model surface, both engines, compared.
//
// The three representative documents prove the options are right; this proves
// they are right for everything else a call site might hand over — including the
// four types that marshal themselves, which no option reaches and which would
// otherwise only be verified by a note in the project's measurements.
func TestModelsMatchV1ExceptEmptyCollections(t *testing.T) {
	t.Parallel()

	job := models.Job{
		SchemaVersion: models.JobSchemaCurrent,
	}
	job.MetaData.Revision = models.InitialDocumentRevision
	user := models.UserAccountDocument{
		SchemaVersion: models.UserAccountDocumentSchemaCurrent,
	}
	user.MetaData.Revision = models.InitialDocumentRevision
	settings := models.ApplicationSettings{
		SchemaVersion: models.ApplicationSettingsSchemaCurrent,
	}
	settings.MetaData.Revision = models.InitialDocumentRevision
	group := models.Group{
		SchemaVersion: models.GroupSchemaCurrent,
	}
	group.MetaData.Revision = models.InitialDocumentRevision
	stats := models.ArchivedJobStats{
		SchemaVersion: models.ArchivedJobStatsSchemaCurrent,
	}
	timeline := models.TimelineMonthBucket{TypeID: 34, Year: 2026, Month: 9}
	timeline.MetaData.Revision = models.InitialDocumentRevision

	deletedAt := "2026-01-02T03:04:05Z"

	for _, tc := range []struct {
		name string
		v    any
	}{
		{"UserAccountDocument", user},
		{"ApplicationSettings", settings},
		{"Group", group},
		{"ArchivedJobStats", stats},
		{"TimelineMonthBucket", timeline},

		// The four that marshal themselves. No option reaches these.
		{"ExtraCost", models.ExtraCost{ID: "e1", Category: "3", ExtraValue: 12.5}},
		{"ExtraCategory", models.ExtraCategory{ID: "c1", Label: "Shipping", Deleted: true, DeletedAt: &deletedAt}},
		{"InventionEntry", models.InventionEntry{ID: "i1", ItemName: "Datacore", ItemCost: 9.75}},
		{"JobLayout", models.JobLayout{ESIJobTab: "all", SetupToEdit: "s1"}},
		{"slice of ExtraCost", []models.ExtraCost{{ID: "a"}, {ID: "b"}}},
		{"map to ExtraCategory", map[string]models.ExtraCategory{"z": {ID: "z"}, "a": {ID: "a"}}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			assertMatchesV1ExceptEmptyCollections(t, tc.v)
		})
	}
}

// What the custom unmarshalers accept, both engines have to read the same way —
// ExtraCost's category has been both a number and a string on the wire, and the
// method that reconciles them is the only thing that knows.
func TestV1AndV2ReadTheCustomUnmarshalersAlike(t *testing.T) {
	t.Parallel()

	for _, tc := range []struct{ name, in string }{
		{"numeric category", `{"id":"e1","category":3,"extraValue":12.5}`},
		{"string category", `{"id":"e1","category":"3","extraValue":12.5}`},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			var a, b models.ExtraCost
			errA := jsonv1.Unmarshal([]byte(tc.in), &a)
			errB := jsoncodec.Unmarshal([]byte(tc.in), &b)
			if (errA == nil) != (errB == nil) {
				t.Fatalf("one engine refused and the other did not: v1=%v ours=%v", errA, errB)
			}
			if errA != nil {
				return
			}
			if a != b {
				t.Fatalf("decoded differently\n v1: %+v\nours: %+v", a, b)
			}
		})
	}
}

func TestUnmarshalRequestRefusesAnUndeclaredMember(t *testing.T) {
	t.Parallel()
	var got struct {
		Name string `json:"name"`
	}
	if err := jsoncodec.UnmarshalRequest([]byte(`{"name":"a","nope":1}`), &got); err == nil {
		t.Fatal("an undeclared member must refuse: a client misspelling a field should be told, not ignored")
	}
	// Unmarshal is the lenient half of the pair, and stays that way — it reads
	// what this codebase itself wrote.
	if err := jsoncodec.Unmarshal([]byte(`{"name":"a","nope":1}`), &got); err != nil {
		t.Fatalf("Unmarshal must keep discarding unknown members: %v", err)
	}
}

func TestUnmarshalRequestRefusesTrailingData(t *testing.T) {
	t.Parallel()
	var got struct {
		Name string `json:"name"`
	}
	err := jsoncodec.UnmarshalRequest([]byte(`{"name":"a"}{"name":"b"}`), &got)
	if !errors.Is(err, jsoncodec.ErrTrailingData) {
		t.Fatalf("err = %v, want ErrTrailingData — two documents in one body is not a syntax error", err)
	}
}

func TestUnmarshalRequestAllowsTrailingWhitespace(t *testing.T) {
	t.Parallel()
	var got struct {
		Name string `json:"name"`
	}
	if err := jsoncodec.UnmarshalRequest([]byte("{\"name\":\"a\"}\n  \t"), &got); err != nil {
		t.Fatalf("whitespace after the value is not trailing data: %v", err)
	}
	if got.Name != "a" {
		t.Fatalf("decoded %+v", got)
	}
}

// The SDE files a browser downloads are written indented. Nothing parses them by
// eye, but the bytes are what an ETag and every cached copy are keyed on, so the
// indentation has to match what shipped rather than merely being valid JSON.
func TestMarshalIndentMatchesV1(t *testing.T) {
	t.Parallel()

	// Shapes taken from the generated SDE: a keyed object of rows, a row holding
	// a nested list, an empty object and an empty list.
	value := map[string]any{
		"34": map[string]any{
			"name":      "Tritanium",
			"jobType":   float64(1),
			"materials": []any{map[string]any{"typeID": float64(38), "quantity": float64(10)}},
		},
		"empties": map[string]any{"object": map[string]any{}, "list": []any{}},
		"escaped": "a<b>c&d",
	}

	got, err := jsoncodec.MarshalIndent(value)
	if err != nil {
		t.Fatal(err)
	}
	want, err := jsonv1.MarshalIndent(value, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != string(want) {
		t.Fatalf("indented output differs from what shipped\n got: %s\nwant: %s", got, want)
	}
}

// Writes are strict about UTF-8 too, which the read side's name for it hides.
// v1 replaced an invalid byte with U+FFFD and wrote the document; this refuses,
// so a string that cannot be represented stops the write rather than being
// silently repaired into one that means something else.
func TestMarshalRefusesInvalidUTF8(t *testing.T) {
	t.Parallel()

	value := struct {
		Name string `json:"name"`
	}{Name: "name \xff\xfe here"}

	if _, err := jsoncodec.Marshal(value); err == nil {
		t.Fatal("invalid UTF-8 must stop the write, not be repaired into U+FFFD")
	}
	// v1 is what the difference is against, and it is what shipped.
	if _, err := jsonv1.Marshal(value); err != nil {
		t.Fatalf("v1 is expected to repair rather than refuse: %v", err)
	}
}

// An error from the callback is the caller saying stop, so it comes back as it
// is and the walk ends where it was — a feed of millions of rows has to be
// abandonable partway.
func TestStreamArrayStopsOnCallbackError(t *testing.T) {
	t.Parallel()

	stop := errors.New("enough")
	seen := 0
	err := jsoncodec.StreamArray(strings.NewReader(`[1,2,3,4,5]`), func(int) error {
		seen++
		if seen == 2 {
			return stop
		}
		return nil
	})
	if !errors.Is(err, stop) {
		t.Fatalf("err = %v, want the callback's error", err)
	}
	if seen != 2 {
		t.Errorf("walked %d elements, want 2", seen)
	}
}

func TestStreamArrayRejectsNonArray(t *testing.T) {
	t.Parallel()

	err := jsoncodec.StreamArray(strings.NewReader(`{"not":"an array"}`), func(int) error { return nil })
	if err == nil || !strings.Contains(err.Error(), "expected a json array") {
		t.Fatalf("err = %v", err)
	}
}

// The elements arrive one at a time and in order, which is the whole point: the
// body is never held whole.
func TestStreamArrayWalksEveryElementInOrder(t *testing.T) {
	t.Parallel()

	type row struct {
		ID int `json:"id"`
	}
	var got []int
	err := jsoncodec.StreamArray(strings.NewReader(`[{"id":1},{"id":2},{"id":3}]`), func(r row) error {
		got = append(got, r.ID)
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 3 || got[0] != 1 || got[2] != 3 {
		t.Fatalf("walked %v", got)
	}
	if err := jsoncodec.StreamArray(strings.NewReader(`[]`), func(row) error {
		t.Fatal("an empty array calls back for nothing")
		return nil
	}); err != nil {
		t.Fatalf("empty array: %v", err)
	}
}

// assertMatchesV1ExceptEmptyCollections compares what we emit against what v1
// emitted, allowing exactly one difference: where v1 wrote null for a nil
// collection, we write its empty form — `[]` for a slice, `{}` for a map.
//
// The comparison is kept rather than dropped because the guarantee it carries is
// still wanted — nothing else about the shape may move. Stating the exception
// here is what lets a deliberate change land without retiring the check that
// would catch an accidental one.
func assertMatchesV1ExceptEmptyCollections(t *testing.T, v any) {
	t.Helper()

	v1Bytes, err := jsonv1.Marshal(v)
	if err != nil {
		t.Fatalf("v1 marshal: %v", err)
	}
	oursBytes, err := jsoncodec.Marshal(v)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	var was, now any
	if err := jsonv1.Unmarshal(v1Bytes, &was); err != nil {
		t.Fatalf("reread v1: %v", err)
	}
	if err := jsonv1.Unmarshal(oursBytes, &now); err != nil {
		t.Fatalf("reread ours: %v", err)
	}
	if diff := compareAllowingEmptyCollection("", was, now); diff != "" {
		t.Fatalf("%s\n v1: %s\nours: %s", diff, v1Bytes, oursBytes)
	}
}

func compareAllowingEmptyCollection(path string, was, now any) string {
	// The one allowed difference.
	if was == nil {
		if arr, ok := now.([]any); ok && len(arr) == 0 {
			return ""
		}
		if obj, ok := now.(map[string]any); ok && len(obj) == 0 {
			return ""
		}
	}
	switch wasVal := was.(type) {
	case map[string]any:
		nowVal, ok := now.(map[string]any)
		if !ok {
			return fmt.Sprintf("%s: object became %T", path, now)
		}
		if len(wasVal) != len(nowVal) {
			return fmt.Sprintf("%s: %d fields became %d", path, len(wasVal), len(nowVal))
		}
		for k, wv := range wasVal {
			nv, present := nowVal[k]
			if !present {
				return fmt.Sprintf("%s.%s: field disappeared", path, k)
			}
			if diff := compareAllowingEmptyCollection(path+"."+k, wv, nv); diff != "" {
				return diff
			}
		}
		return ""
	case []any:
		nowVal, ok := now.([]any)
		if !ok {
			return fmt.Sprintf("%s: array became %T", path, now)
		}
		if len(wasVal) != len(nowVal) {
			return fmt.Sprintf("%s: %d elements became %d", path, len(wasVal), len(nowVal))
		}
		for i := range wasVal {
			if diff := compareAllowingEmptyCollection(fmt.Sprintf("%s[%d]", path, i), wasVal[i], nowVal[i]); diff != "" {
				return diff
			}
		}
		return ""
	default:
		if fmt.Sprintf("%v", was) != fmt.Sprintf("%v", now) {
			return fmt.Sprintf("%s: %v became %v", path, was, now)
		}
		return ""
	}
}

// Escaping is a byte-level property, and the sweeps above compare values rather
// than bytes so they cannot see it: "a<b>" and "a<b>" read back as the
// same string. It is asserted here instead.
//
// It matters because these bytes are embedded in HTML by readers outside this
// codebase, where an unescaped "<" closes a tag the payload did not open.
func TestOutputEscapesHTML(t *testing.T) {
	t.Parallel()

	got, err := jsoncodec.Marshal(struct {
		S string `json:"s"`
	}{S: `a<b>c&d`})
	if err != nil {
		t.Fatal(err)
	}
	const want = `{"s":"a\u003cb\u003ec\u0026d"}`
	if string(got) != want {
		t.Fatalf("got  %s\nwant %s", got, want)
	}
}

// An empty collection is written empty, both kinds. Object.values on a null
// throws where the same call on {} returns nothing, so the empty form is the
// one a reader can act on without guarding first.
func TestEmptyCollectionsAreWrittenEmpty(t *testing.T) {
	t.Parallel()

	got, err := jsoncodec.Marshal(struct {
		NilSlice   []string         `json:"nilSlice"`
		EmptySlice []string         `json:"emptySlice"`
		NilMap     map[string]int   `json:"nilMap"`
		EmptyMap   map[string]int   `json:"emptyMap"`
		NilPointer *struct{ A int } `json:"nilPointer"`
	}{EmptySlice: []string{}, EmptyMap: map[string]int{}})
	if err != nil {
		t.Fatal(err)
	}
	// The pointer stays null: absent is not the same as present and empty.
	const want = `{"nilSlice":[],"emptySlice":[],"nilMap":{},"emptyMap":{},"nilPointer":null}`
	if string(got) != want {
		t.Fatalf("got  %s\nwant %s", got, want)
	}
}
