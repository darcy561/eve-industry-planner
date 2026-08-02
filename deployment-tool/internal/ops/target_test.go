package ops

import (
	"context"
	"strings"
	"testing"
)

func TestResolveRestartTarget(t *testing.T) {
	t.Parallel()
	running := map[string]struct{}{"api": {}, "worker": {}}

	_, _, err := resolveRestartTarget("", "eip", running)
	if err == nil || !strings.Contains(err.Error(), "running:") || !strings.Contains(err.Error(), "api") {
		t.Fatalf("empty: %v", err)
	}

	short, all, err := resolveRestartTarget("all", "eip", running)
	if err != nil || !all || short != "" {
		t.Fatalf("all: short=%q all=%v err=%v", short, all, err)
	}

	short, all, err = resolveRestartTarget("eip_api", "eip", running)
	if err != nil || all || short != "api" {
		t.Fatalf("prefix: short=%q all=%v err=%v", short, all, err)
	}

	short, all, err = resolveRestartTarget("worker", "eip", running)
	if err != nil || all || short != "worker" {
		t.Fatalf("short: short=%q all=%v err=%v", short, all, err)
	}

	_, _, err = resolveRestartTarget("ghost", "eip", running)
	if err == nil || !strings.Contains(err.Error(), "unknown") {
		t.Fatalf("unknown: %v", err)
	}
}

func TestLogsGuards(t *testing.T) {
	t.Parallel()
	ctx := context.Background()

	err := Logs(ctx, LogsOpts{})
	if err == nil || !strings.Contains(err.Error(), "service name required") {
		t.Fatalf("empty: %v", err)
	}

	err = Logs(ctx, LogsOpts{Target: "all", Follow: true})
	if err == nil || !strings.Contains(err.Error(), "follow") {
		t.Fatalf("follow+all: %v", err)
	}

	err = StreamLogs(ctx, LogsOpts{Target: "all", Follow: true}, nil)
	if err == nil || !strings.Contains(err.Error(), "follow") {
		t.Fatalf("stream follow+all: %v", err)
	}
}

func TestEffectiveTail(t *testing.T) {
	t.Parallel()
	if got := effectiveTail(""); got != "100" {
		t.Fatalf("default %q", got)
	}
	if got := effectiveTail(" 50 "); got != " 50 " {
		t.Fatalf("passthrough %q", got)
	}
}
