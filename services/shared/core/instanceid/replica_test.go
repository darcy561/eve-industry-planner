package instanceid

import (
	"testing"
)

func TestReplica_priority(t *testing.T) {
	t.Run("OTEL_SERVICE_INSTANCE_ID wins", func(t *testing.T) {
		t.Setenv("OTEL_SERVICE_INSTANCE_ID", "otel-1")
		t.Setenv("WS_CONSUMER_NAME", "ws")
		t.Setenv("DOCKER_CONTAINER_NAME", "eve_planner_ws_1")
		t.Setenv("HOSTNAME", "abc123")
		if got := Replica(); got != "otel-1" {
			t.Fatalf("got %q want otel-1", got)
		}
	})
	t.Run("WS_CONSUMER_NAME before DOCKER_CONTAINER_NAME", func(t *testing.T) {
		t.Setenv("OTEL_SERVICE_INSTANCE_ID", "")
		t.Setenv("WS_CONSUMER_NAME", "alpha")
		t.Setenv("DOCKER_CONTAINER_NAME", "eve_planner_ws_1")
		t.Setenv("CONTAINER_NAME", "legacy")
		t.Setenv("HOSTNAME", "containerid12")
		if got := Replica(); got != "alpha" {
			t.Fatalf("got %q want alpha", got)
		}
	})
	t.Run("DOCKER_CONTAINER_NAME before CONTAINER_NAME", func(t *testing.T) {
		t.Setenv("OTEL_SERVICE_INSTANCE_ID", "")
		t.Setenv("WS_CONSUMER_NAME", "")
		t.Setenv("DOCKER_CONTAINER_NAME", "eve_planner_ws_1")
		t.Setenv("CONTAINER_NAME", "legacy")
		t.Setenv("HOSTNAME", "host")
		if got := Replica(); got != "eve_planner_ws_1" {
			t.Fatalf("got %q want eve_planner_ws_1", got)
		}
	})
	t.Run("CONTAINER_NAME before HOSTNAME", func(t *testing.T) {
		t.Setenv("OTEL_SERVICE_INSTANCE_ID", "")
		t.Setenv("WS_CONSUMER_NAME", "")
		t.Setenv("DOCKER_CONTAINER_NAME", "")
		t.Setenv("CONTAINER_NAME", "mytask")
		t.Setenv("HOSTNAME", "abc123")
		if got := Replica(); got != "mytask" {
			t.Fatalf("got %q want mytask", got)
		}
	})
}

func TestReplica_sanitizes(t *testing.T) {
	t.Setenv("OTEL_SERVICE_INSTANCE_ID", "")
	t.Setenv("WS_CONSUMER_NAME", "bad name#")
	if got := Replica(); got != "bad_name" {
		t.Fatalf("got %q want bad_name", got)
	}
}
