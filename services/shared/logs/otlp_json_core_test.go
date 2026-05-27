package logs

import (
	"context"
	"testing"

	logglobal "go.opentelemetry.io/otel/log/global"
	"go.opentelemetry.io/otel/log/logtest"
)

func firstRecorded(t *testing.T, rec *logtest.Recorder) logtest.Record {
	t.Helper()
	for _, records := range rec.Result() {
		if len(records) > 0 {
			return records[0]
		}
	}
	t.Fatal("no log records captured")
	return logtest.Record{}
}

func TestOTLPExport_emitsMessageBodyAndAttributes(t *testing.T) {
	rec := logtest.NewRecorder()
	prev := logglobal.GetLoggerProvider()
	logglobal.SetLoggerProvider(rec)
	t.Cleanup(func() {
		DisableOTLPExport()
		logglobal.SetLoggerProvider(prev)
	})

	EnableOTLPExport()
	InfoCtx(context.Background(), "request completed", "method", "GET", "status_code", 200)

	r := firstRecorded(t, rec)
	if got := r.Body.AsString(); got != "request completed" {
		t.Fatalf("body = %q, want message only", got)
	}
	if r.SeverityText != "INFO" && r.SeverityText != "info" {
		t.Fatalf("severity = %q", r.SeverityText)
	}
	attrs := make(map[string]string)
	for _, kv := range r.Attributes {
		attrs[kv.Key] = kv.Value.AsString()
	}
	if attrs["method"] != "GET" {
		t.Fatalf("attrs = %v, want method=GET", attrs)
	}
}
