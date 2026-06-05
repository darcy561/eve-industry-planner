package logs

import (
	"context"
	"testing"

	logglobal "go.opentelemetry.io/otel/log/global"
	"go.opentelemetry.io/otel/log/logtest"
)

func TestAttachDebugStepOrDebugCtx_usesStoreWhenPresent(t *testing.T) {
	rec := logtest.NewRecorder()
	prev := logglobal.GetLoggerProvider()
	logglobal.SetLoggerProvider(rec)
	t.Cleanup(func() {
		DisableOTLPExport()
		logglobal.SetLoggerProvider(prev)
	})

	ctx := WithHandlerFailureDetailStore(context.Background())
	AttachDebugStepOrDebugCtx(ctx, "jetstream_published", "JetStream message published", map[string]interface{}{
		"subject": "tasks.example",
	})

	steps := DebugStepsFromContext(ctx)
	if len(steps) != 1 || steps[0].Step != "jetstream_published" {
		t.Fatalf("steps = %#v", steps)
	}
	if len(rec.Result()) != 0 {
		t.Fatal("expected no separate OTLP log when request store is present")
	}
}

func TestAttachDebugStepOrDebugCtx_fallsBackToDebugCtxWithoutStore(t *testing.T) {
	rec := logtest.NewRecorder()
	prev := logglobal.GetLoggerProvider()
	logglobal.SetLoggerProvider(rec)
	t.Cleanup(func() {
		DisableOTLPExport()
		logglobal.SetLoggerProvider(prev)
	})

	EnableOTLPExport()
	AttachDebugStepOrDebugCtx(context.Background(), "jetstream_published", "JetStream message published", map[string]interface{}{
		"subject": "tasks.example",
	})

	if len(DebugStepsFromContext(context.Background())) != 0 {
		t.Fatal("expected no debug steps without store")
	}
	if len(rec.Result()) == 0 {
		t.Fatal("expected fallback Debug log without request store")
	}
}
