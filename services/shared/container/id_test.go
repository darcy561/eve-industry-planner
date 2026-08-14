package container

import (
	"strings"
	"testing"
)

func TestID_HOSTNAME(t *testing.T) {
	t.Setenv("HOSTNAME", "bea90f22c969")
	if got := ID(); got != "bea90f22c969" {
		t.Fatalf("got %q want bea90f22c969", got)
	}
}

func TestID_ignoresOTEL(t *testing.T) {
	t.Setenv("HOSTNAME", "bea90f22c969")
	t.Setenv("OTEL_SERVICE_INSTANCE_ID", "websocket-1")
	t.Setenv("WS_CONSUMER_NAME", "ws")
	t.Setenv("DOCKER_CONTAINER_NAME", "eip_websocket.1.xxx")
	if got := ID(); got != "bea90f22c969" {
		t.Fatalf("got %q want bea90f22c969 (must not prefer OTEL/slot env)", got)
	}
}

func TestID_sanitizes(t *testing.T) {
	t.Setenv("HOSTNAME", "bad name#")
	if got := ID(); got != "bad_name" {
		t.Fatalf("got %q want bad_name", got)
	}
}

func TestID_truncates(t *testing.T) {
	t.Setenv("HOSTNAME", strings.Repeat("a", 80))
	got := ID()
	if len(got) != 64 {
		t.Fatalf("len=%d want 64", len(got))
	}
}
