package logs

import (
	"testing"

	"go.uber.org/zap/zapcore"
)

func TestLogLevel_parsesEnvAndDefaultsToInfo(t *testing.T) {
	cases := map[string]zapcore.Level{
		"":        zapcore.InfoLevel,
		"debug":   zapcore.DebugLevel,
		"DEBUG":   zapcore.DebugLevel,
		"info":    zapcore.InfoLevel,
		"warn":    zapcore.WarnLevel,
		"warning": zapcore.WarnLevel,
		"error":   zapcore.ErrorLevel,
		"chatty":  zapcore.InfoLevel,
	}
	for raw, want := range cases {
		t.Setenv("LOG_LEVEL", raw)
		if got := logLevel(); got != want {
			t.Fatalf("LOG_LEVEL=%q: got %v, want %v", raw, got, want)
		}
	}
}

func TestDebugStepsField_onlyEmittedAtDebug(t *testing.T) {
	steps := []DebugStep{{Step: "started"}}

	t.Setenv("LOG_LEVEL", "info")
	if f := DebugStepsField(steps); f.Type != zapcore.SkipType {
		t.Fatal("expected debug_steps to be skipped below debug")
	}

	t.Setenv("LOG_LEVEL", "debug")
	f := DebugStepsField(steps)
	if f.Type == zapcore.SkipType {
		t.Fatal("expected debug_steps at LOG_LEVEL=debug")
	}
	if f.Key != DebugStepsLogKey {
		t.Fatalf("got key %q, want %q", f.Key, DebugStepsLogKey)
	}

	if f := DebugStepsField(nil); f.Type != zapcore.SkipType {
		t.Fatal("expected no field without steps")
	}
}

func TestBuildRoot_honoursLevelOnStdout(t *testing.T) {
	t.Setenv("LOG_LEVEL", "warn")
	DisableOTLPExport()
	t.Cleanup(ResetRoot)

	l := Zap()
	if l.Core().Enabled(zapcore.InfoLevel) {
		t.Fatal("expected info to be filtered at LOG_LEVEL=warn")
	}
	if !l.Core().Enabled(zapcore.WarnLevel) {
		t.Fatal("expected warn to pass at LOG_LEVEL=warn")
	}
}
