package process

import (
	"os"
	"testing"
)

func TestTakeUpdateResume(t *testing.T) {
	t.Setenv(EnvUpdateResume, ValueTrue)
	if !TakeUpdateResume() {
		t.Fatal("expected true")
	}
	if os.Getenv(EnvUpdateResume) != "" {
		t.Fatal("expected env cleared")
	}
	if TakeUpdateResume() {
		t.Fatal("second take should be false")
	}
}
