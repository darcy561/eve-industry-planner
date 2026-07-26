package msg

import (
	"encoding/json"
	"testing"

	"eve-industry-planner/admintool/internal/process"
)

func TestParseLine(t *testing.T) {
	raw, _ := json.Marshal(TextPayload{Message: "hi"})
	line := Prefix + string(mustJSON(Envelope{Version: Version, Type: TypePaneText, Data: raw}))
	env, ok := ParseLine(line)
	if !ok || env.Type != TypePaneText {
		t.Fatalf("%v %+v", ok, env)
	}
	msg, err := DecodeText(env.Data)
	if err != nil || msg != "hi" {
		t.Fatal(err, msg)
	}
}

func TestParseLineRejectsBadVersion(t *testing.T) {
	line := `EIPMSG {"version":99,"type":"pane.text","data":{"message":"x"}}`
	if _, ok := ParseLine(line); ok {
		t.Fatal("expected reject")
	}
}

func TestParseLineRejectsNonProtocol(t *testing.T) {
	for _, line := range []string{
		`hello world`,
		`{"version":1,"type":"pane.text","data":{}}`, // missing EIPMSG prefix
	} {
		if _, ok := ParseLine(line); ok {
			t.Fatalf("accepted %q", line)
		}
	}
}

func TestEmitNoopWhenDisabled(t *testing.T) {
	t.Setenv(process.EnvFromTUI, "")
	EmitText("x")
	EmitStatus(map[string]string{"a": "b"})
	Line("y")
	w := NewLineWriter()
	_, _ = w.Write([]byte("partial"))
	w.Flush()
}

func TestLineWriterSplits(t *testing.T) {
	t.Setenv(process.EnvFromTUI, "1")
	w := NewLineWriter()
	if _, err := w.Write([]byte("one\ntwo\r\n")); err != nil {
		t.Fatal(err)
	}
	if _, err := w.Write([]byte("thr")); err != nil {
		t.Fatal(err)
	}
	if _, err := w.Write([]byte("ee\n")); err != nil {
		t.Fatal(err)
	}
	w.Flush()
}

func TestIsChip(t *testing.T) {
	if !IsChip(TypeChipDocker) || IsChip(TypePaneText) {
		t.Fatal("IsChip")
	}
}

func mustJSON(v any) []byte {
	b, err := json.Marshal(v)
	if err != nil {
		panic(err)
	}
	return b
}
