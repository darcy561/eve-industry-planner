package commands

import (
	"reflect"
	"testing"
)

func TestBinaryInstallTUIRestartMessage(t *testing.T) {
	t.Parallel()
	if got := binaryInstallTUIRestartMessage(false); got != "restart-resume" {
		t.Fatalf("full update chip=%q", got)
	}
	if got := binaryInstallTUIRestartMessage(true); got != "restart" {
		t.Fatalf("binary-only chip=%q", got)
	}
}

func TestUpdateContinueArgs(t *testing.T) {
	t.Parallel()
	if got := updateContinueArgs(false, false, false); !reflect.DeepEqual(got, []string{"update"}) {
		t.Fatalf("default=%v", got)
	}
	if got := updateContinueArgs(true, false, true); !reflect.DeepEqual(got, []string{"update", "--dry-run", "--images-only"}) {
		t.Fatalf("flags=%v", got)
	}
}
