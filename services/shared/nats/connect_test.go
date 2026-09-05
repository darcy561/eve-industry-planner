package nats

import "testing"

func TestServiceNameFromBinaryNamesTheService(t *testing.T) {
	for binary, want := range map[string]string{
		"/out/api-service":         "api",
		"core-service":             "core",
		"/app/websocket-service":   "websocket",
		"worker-service":           "worker",
		"/out/capacity-controller": "capacity-controller",
		"/out/ws-router":           "ws-router",
	} {
		if got := serviceNameFromBinary(binary); got != want {
			t.Errorf("serviceNameFromBinary(%q) = %q, want %q", binary, got, want)
		}
	}
}
