package dataplane_test

import (
	"errors"
	"strings"
	"testing"

	"eve-industry-planner/admintool/internal/dataplane"
)

func TestErrNotReadyMessage(t *testing.T) {
	t.Parallel()
	err := dataplane.ErrNotReady{Reason: "bucket static-data missing"}
	msg := err.Error()
	if !strings.Contains(msg, "eip init") || !strings.Contains(msg, "ensure-mongo") {
		t.Fatalf("%q", msg)
	}
	if !strings.Contains(msg, "bucket static-data missing") {
		t.Fatalf("%q", msg)
	}
	var target dataplane.ErrNotReady
	if !errors.As(err, &target) {
		t.Fatal("errors.As failed")
	}
	if target.Reason == "" {
		t.Fatal("empty reason")
	}
}
