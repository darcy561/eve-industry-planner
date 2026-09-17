package helper

import (
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// DecodeJSONOrBadRequest copies Detail, Field, Offset and BodyPreview into the
// 400 body, so each refusal below is a wire shape the SPA reads.

type decodeTarget struct {
	Name  string `json:"name"`
	Count int    `json:"count"`
}

func postBody(s string) *http.Request {
	return httptest.NewRequest(http.MethodPost, "/", strings.NewReader(s))
}

func decodeErr(t *testing.T, r *http.Request, max int64) *JSONRequestError {
	t.Helper()
	var target decodeTarget
	err := DecodeJSONRequest(r, &target, max)
	if err == nil {
		t.Fatal("expected a refusal")
	}
	jsonErr, ok := errors.AsType[*JSONRequestError](err)
	if !ok {
		t.Fatalf("err is %T, want *JSONRequestError — the 400 body is built from its fields", err)
	}
	return jsonErr
}

func TestDecodeJSONRequestAcceptsAValidBody(t *testing.T) {
	t.Parallel()
	var target decodeTarget
	if err := DecodeJSONRequest(postBody(`{"name":"a","count":2}`), &target, DefaultMaxBodySize); err != nil {
		t.Fatal(err)
	}
	if target.Name != "a" || target.Count != 2 {
		t.Fatalf("decoded %+v", target)
	}
}

func TestDecodeJSONRequestRefusesAnEmptyBody(t *testing.T) {
	t.Parallel()
	if got := decodeErr(t, postBody(""), DefaultMaxBodySize).Detail; got != "empty_body" {
		t.Fatalf("detail = %q", got)
	}
}

func TestDecodeJSONRequestRefusesAnOversizeBody(t *testing.T) {
	t.Parallel()
	body := `{"name":"` + strings.Repeat("x", 64) + `"}`
	err := decodeErr(t, postBody(body), 16)
	if err.Detail != "body_too_large" {
		t.Fatalf("detail = %q", err.Detail)
	}
	if err.BodyPreview == "" {
		t.Fatal("an oversize refusal still carries a preview, so a caller can see what arrived")
	}
}

func TestDecodeJSONRequestReportsSyntaxErrorsWithAnOffset(t *testing.T) {
	t.Parallel()
	err := decodeErr(t, postBody(`{"name":}`), DefaultMaxBodySize)
	if err.Detail != "syntax_error" {
		t.Fatalf("detail = %q", err.Detail)
	}
	if err.Offset == 0 {
		t.Fatal("offset is what points the caller at the byte that failed")
	}
}

func TestDecodeJSONRequestReportsATypeMismatchWithItsField(t *testing.T) {
	t.Parallel()
	err := decodeErr(t, postBody(`{"name":"a","count":"two"}`), DefaultMaxBodySize)
	if !strings.HasPrefix(err.Detail, "type_mismatch") {
		t.Fatalf("detail = %q", err.Detail)
	}
	if err.Field != "count" {
		t.Fatalf("field = %q, want count", err.Field)
	}
}

func TestDecodeJSONRequestRefusesAnUnknownField(t *testing.T) {
	t.Parallel()
	err := decodeErr(t, postBody(`{"name":"a","nope":1}`), DefaultMaxBodySize)
	if err.Detail != "unknown_field" {
		t.Fatalf("detail = %q", err.Detail)
	}
	if err.Field != "nope" {
		t.Fatalf("field = %q, want nope", err.Field)
	}
}

// Two documents in one body decode as one and leave the rest unread.
func TestDecodeJSONRequestRefusesTrailingData(t *testing.T) {
	t.Parallel()
	if got := decodeErr(t, postBody(`{"name":"a"}{"name":"b"}`), DefaultMaxBodySize).Detail; got != "extra_data" {
		t.Fatalf("detail = %q", got)
	}
}

func TestDecodeJSONRequestDefaultsANonPositiveLimit(t *testing.T) {
	t.Parallel()
	var target decodeTarget
	if err := DecodeJSONRequest(postBody(`{"name":"a"}`), &target, 0); err != nil {
		t.Fatalf("a zero limit means the default, not a body of zero bytes: %v", err)
	}
}

type failingBody struct{}

func (failingBody) Read([]byte) (int, error) { return 0, errors.New("connection reset") }
func (failingBody) Close() error             { return nil }

func TestDecodeJSONRequestReportsAReadFailure(t *testing.T) {
	t.Parallel()
	r := postBody("")
	r.Body = failingBody{}
	if got := decodeErr(t, r, DefaultMaxBodySize).Detail; got != "read_error" {
		t.Fatalf("detail = %q", got)
	}
}

// A preview reaches a 400 body and a log line, so it stays bounded and single
// line.
func TestJSONPreviewIsBoundedAndSingleLine(t *testing.T) {
	t.Parallel()

	got := makeJSONPreview([]byte("{\n\t\"name\":\t\"a\"\r\n}"))
	if strings.ContainsAny(got, "\n\r\t") {
		t.Fatalf("preview kept whitespace that would break a log line: %q", got)
	}

	long := makeJSONPreview([]byte(strings.Repeat("x", maxJSONBodyPreview+50)))
	if len(long) <= maxJSONBodyPreview || !strings.HasSuffix(long, "...(truncated)") {
		t.Fatalf("long preview = %d chars, suffix %q", len(long), long[max(0, len(long)-16):])
	}
	if makeJSONPreview(nil) != "" {
		t.Fatal("no body means no preview")
	}
}

var _ io.Reader = failingBody{}

func TestDecodeJSONRequestNamesANestedFieldByItsPath(t *testing.T) {
	t.Parallel()
	var target struct {
		Rows []decodeTarget `json:"rows"`
	}
	err := DecodeJSONRequest(postBody(`{"rows":[{"name":"a","count":"two"}]}`), &target, DefaultMaxBodySize)
	jsonErr, ok := errors.AsType[*JSONRequestError](err)
	if !ok {
		t.Fatalf("err = %v (%T)", err, err)
	}
	if jsonErr.Field != "rows.0.count" {
		t.Fatalf("field = %q, want rows.0.count", jsonErr.Field)
	}
}

// A repeated name must refuse: taking one of the two reads a document nobody
// sent.
func TestDecodeJSONRequestRefusesADuplicateField(t *testing.T) {
	t.Parallel()
	if got := decodeErr(t, postBody(`{"name":"a","name":"b"}`), DefaultMaxBodySize).Detail; got == "" {
		t.Fatal("a duplicate member must refuse rather than take one of the two")
	}
	var target decodeTarget
	if err := DecodeJSONRequest(postBody(`{"name":"a","name":"b"}`), &target, DefaultMaxBodySize); err == nil {
		t.Fatalf("decoded %+v from a body carrying two names", target)
	}
}

// Case-insensitive matching would make the accepted shape wider than the
// declared one, silently.
func TestDecodeJSONRequestRefusesAMiscasedField(t *testing.T) {
	t.Parallel()
	err := decodeErr(t, postBody(`{"Name":"a"}`), DefaultMaxBodySize)
	if err.Detail != "unknown_field" {
		t.Fatalf("detail = %q, want unknown_field", err.Detail)
	}
	if err.Field != "Name" {
		t.Fatalf("field = %q, want Name", err.Field)
	}
}

func TestDecodeJSONRequestRefusesInvalidUTF8(t *testing.T) {
	t.Parallel()
	var target decodeTarget
	if err := DecodeJSONRequest(postBody("{\"name\":\"\xff\"}"), &target, DefaultMaxBodySize); err == nil {
		t.Fatalf("decoded %+v from invalid UTF-8", target)
	}
}
