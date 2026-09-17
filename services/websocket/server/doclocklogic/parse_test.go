package doclocklogic

import (
	"strings"
	"testing"
)

func TestParsePresence(t *testing.T) {
	t.Parallel()
	f, ok := ParsePresence([]byte(`{"collection":"jobs","docID":"j1","owner":"corporation:98000001"}`))
	if !ok || f.Collection != "jobs" || f.DocID != "j1" || f.Owner != "corporation:98000001" {
		t.Fatalf("got %+v ok=%v", f, ok)
	}
	// An owner is not parsing's to refuse: the handler decides, because only it
	// knows what the session was granted.
	if f, ok := ParsePresence([]byte(`{"collection":"jobs","docID":"j1"}`)); !ok || f.Owner != "" {
		t.Fatalf("a frame naming no owner should parse with none, got %+v ok=%v", f, ok)
	}
	if _, ok := ParsePresence([]byte(`{"collection":"jobs"}`)); ok {
		t.Fatal("expected missing docID to fail")
	}
	if _, ok := ParsePresence([]byte(`not-json`)); ok {
		t.Fatal("expected bad json to fail")
	}
}

func TestParseLockStateBatch(t *testing.T) {
	t.Parallel()
	req, ok, err := ParseLockStateBatch([]byte(`{"requestId":"r1","jobDocIDs":["a"],"groupDocIDs":["b"]}`))
	if err != nil || !ok || req.RequestID != "r1" || len(req.JobDocIDs) != 1 || len(req.GroupDocIDs) != 1 {
		t.Fatalf("got %+v ok=%v err=%v", req, ok, err)
	}
	if _, ok, err := ParseLockStateBatch([]byte(`{"jobDocIDs":["a"]}`)); err != nil || ok {
		t.Fatalf("missing requestId: ok=%v err=%v", ok, err)
	}
	if _, ok, err := ParseLockStateBatch([]byte(`{`)); err == nil || ok {
		t.Fatal("expected parse error")
	}
}

func TestMarshalLockStateBatchAck(t *testing.T) {
	t.Parallel()
	b, err := MarshalLockStateBatchAck("r1", true, map[string]any{"j": 1}, map[string]any{"g": 2}, "")
	if err != nil {
		t.Fatal(err)
	}
	s := string(b)
	for _, part := range []string{`"ok":true`, `"requestId":"r1"`, `"type":"` + MsgLockStateBatchAck + `"`} {
		if !strings.Contains(s, part) {
			t.Fatalf("missing %s in %s", part, s)
		}
	}
	b, err = MarshalLockStateBatchAck("r2", false, nil, nil, "empty")
	if err != nil {
		t.Fatal(err)
	}
	s = string(b)
	if !strings.Contains(s, `"ok":false`) || !strings.Contains(s, `"error":"empty"`) {
		t.Fatalf("payload=%s", s)
	}
}
