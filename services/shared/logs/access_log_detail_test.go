package logs

import (
	"testing"

	"go.uber.org/zap/zapcore"
)

func TestAccessLogDetailFields_FlattensAndSkipsIdentity(t *testing.T) {
	t.Parallel()
	fields := AccessLogDetailFields(map[string]interface{}{
		"account_id": "acc",
		"session_id": "sess",
		"found":      false,
		"type_id":    "abc",
	})
	if len(fields) != 2 {
		t.Fatalf("len(fields) = %d, want 2", len(fields))
	}
	keys := make(map[string]struct{}, len(fields))
	for _, f := range fields {
		keys[f.Key] = struct{}{}
	}
	for _, want := range []string{"found", "type_id"} {
		if _, ok := keys[want]; !ok {
			t.Fatalf("missing key %q in %v", want, keys)
		}
	}
	for _, skip := range []string{"account_id", "session_id"} {
		if _, ok := keys[skip]; ok {
			t.Fatalf("unexpected reserved key %q", skip)
		}
	}
}

func TestAccessLogDetailFields_Empty(t *testing.T) {
	t.Parallel()
	if fields := AccessLogDetailFields(nil); fields != nil {
		t.Fatalf("expected nil, got %v", fields)
	}
}

func TestAccessLogDetailFields_EncodesValues(t *testing.T) {
	t.Parallel()
	fields := AccessLogDetailFields(map[string]interface{}{"jobs": int64(10)})
	if len(fields) != 1 {
		t.Fatalf("len(fields) = %d", len(fields))
	}
	enc := zapcore.NewMapObjectEncoder()
	fields[0].AddTo(enc)
	if enc.Fields["jobs"] != int64(10) {
		t.Fatalf("jobs = %v", enc.Fields["jobs"])
	}
}
