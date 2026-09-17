package helper

import (
	jsonv1 "encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

type body struct {
	Name  string   `json:"name"`
	Count int      `json:"count,omitzero"`
	Tags  []string `json:"tags"`
}

func TestEncodeJSONWritesTheBodyAndContentType(t *testing.T) {
	t.Parallel()
	w := httptest.NewRecorder()

	if err := EncodeJSON(w, body{Name: "a", Tags: []string{"x"}}); err != nil {
		t.Fatal(err)
	}
	if got := w.Header().Get("Content-Type"); got != "application/json" {
		t.Fatalf("Content-Type = %q", got)
	}
	if got, want := w.Body.String(), "{\"name\":\"a\",\"tags\":[\"x\"]}\n"; got != want {
		t.Fatalf("body = %q, want %q", got, want)
	}
}

// A nil slice answers null, not []. Changing that is a wire decision, not a side
// effect of routing a handler.
func TestEncodeJSONWritesNilSlicesAsNull(t *testing.T) {
	t.Parallel()
	w := httptest.NewRecorder()

	if err := EncodeJSON(w, body{Name: "a"}); err != nil {
		t.Fatal(err)
	}
	if got, want := w.Body.String(), "{\"name\":\"a\",\"tags\":null}\n"; got != want {
		t.Fatalf("body = %q, want %q", got, want)
	}
}

// EncodeJSON must not spend the header on a 200 the caller did not ask for.
func TestEncodeJSONLeavesTheCallersStatusAlone(t *testing.T) {
	t.Parallel()
	w := httptest.NewRecorder()

	w.WriteHeader(http.StatusCreated)
	if err := EncodeJSON(w, body{Name: "a"}); err != nil {
		t.Fatal(err)
	}
	if w.Code != http.StatusCreated {
		t.Fatalf("status = %d, want %d", w.Code, http.StatusCreated)
	}
}

// WriteHeader sends the header map as it stands, so a Content-Type set after it
// never reaches the client.
func TestEncodeJSONStatusSendsContentTypeWithTheStatus(t *testing.T) {
	t.Parallel()
	w := httptest.NewRecorder()

	if err := EncodeJSONStatus(w, http.StatusConflict, body{Name: "a"}); err != nil {
		t.Fatal(err)
	}
	if w.Code != http.StatusConflict {
		t.Fatalf("status = %d, want %d", w.Code, http.StatusConflict)
	}
	if got := w.Result().Header.Get("Content-Type"); got != "application/json" {
		t.Fatalf("Content-Type on the sent response = %q", got)
	}
}

type failingWriter struct{ http.ResponseWriter }

func (failingWriter) Write([]byte) (int, error) { return 0, errors.New("connection gone") }

func TestEncodeJSONReportsAWriteFailure(t *testing.T) {
	t.Parallel()

	err := EncodeJSON(failingWriter{httptest.NewRecorder()}, body{Name: "a"})
	if err == nil {
		t.Fatal("a failed write must reach the caller, which is what decides whether to log it")
	}
}

// The ETag hashes the payload, so a moved byte misses every cached app-config a
// browser holds.
func TestETagPayloadIsUnchangedFromV1(t *testing.T) {
	t.Parallel()

	data := struct {
		Version  string         `json:"version"`
		Flags    map[string]any `json:"flags"`
		Missing  []string       `json:"missing"`
		Disabled bool           `json:"disabled"`
	}{
		Version: "1.2.3",
		Flags:   map[string]any{"b": true, "a": 1.0, "c": "x"},
	}

	payload, etag, err := BuildJSONPayloadAndWeakETag(data)
	if err != nil {
		t.Fatal(err)
	}
	want, err := jsonv1.Marshal(data)
	if err != nil {
		t.Fatal(err)
	}
	if string(payload) != string(want) {
		t.Fatalf("payload\n got %s\nwant %s", payload, want)
	}
	if etag == "" || !strings.HasPrefix(etag, `W/"`) {
		t.Fatalf("etag = %q", etag)
	}
}
