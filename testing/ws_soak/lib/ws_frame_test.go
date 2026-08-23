package soaklib

import "testing"

func TestBytesEqASCII(t *testing.T) {
	if !bytesEqASCII([]byte("pong"), "pong") || bytesEqASCII([]byte("pong"), "ping") {
		t.Fatal("eq")
	}
}

func TestExtractJSONStringField(t *testing.T) {
	raw := []byte(`{"type":"please_reconnect","docID":"abc-1","n":1}`)
	if got := extractJSONStringField(raw, "type"); got != "please_reconnect" {
		t.Fatalf("type=%q", got)
	}
	if got := extractJSONStringField(raw, "docID"); got != "abc-1" {
		t.Fatalf("docID=%q", got)
	}
	if got := extractJSONStringField(raw, "missing"); got != "" {
		t.Fatalf("missing=%q", got)
	}
	spaced := []byte(`{ "docID" : "x y" }`)
	if got := extractJSONStringField(spaced, "docID"); got != "x y" {
		t.Fatalf("spaced=%q", got)
	}
}
