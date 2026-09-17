package jsoncodec_test

import (
	"bytes"
	jsonv1 "encoding/json"
	"errors"
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
func TestMarshalIsByteIdenticalToV1(t *testing.T) {
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
			want, err := jsonv1.Marshal(tc.v)
			if err != nil {
				t.Fatalf("v1 marshal: %v", err)
			}
			got, err := jsoncodec.Marshal(tc.v)
			if err != nil {
				t.Fatalf("jsoncodec marshal: %v", err)
			}
			if string(got) != string(want) {
				t.Fatalf("bytes differ\n v1: %s\nours: %s", want, got)
			}
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
func TestEncodeMatchesTheV1Encoder(t *testing.T) {
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
			var want bytes.Buffer
			if err := jsonv1.NewEncoder(&want).Encode(tc.v); err != nil {
				t.Fatalf("v1 encode: %v", err)
			}
			var got bytes.Buffer
			if err := jsoncodec.Encode(&got, tc.v); err != nil {
				t.Fatalf("jsoncodec encode: %v", err)
			}
			if got.String() != want.String() {
				t.Fatalf("bytes differ\n v1: %q\nours: %q", want.String(), got.String())
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
func TestV1AndV2AgreeAcrossTheModels(t *testing.T) {
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
			want, err := jsonv1.Marshal(tc.v)
			if err != nil {
				t.Fatalf("v1 marshal: %v", err)
			}
			got, err := jsoncodec.Marshal(tc.v)
			if err != nil {
				t.Fatalf("jsoncodec marshal: %v", err)
			}
			if string(got) != string(want) {
				t.Fatalf("the engines disagree\n v1: %s\nours: %s", want, got)
			}
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
