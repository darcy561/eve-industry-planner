package process

import "testing"

func TestFromTUI(t *testing.T) {
	t.Setenv(EnvFromTUI, "")
	if FromTUI() {
		t.Fatal("expected false when unset")
	}
	t.Setenv(EnvFromTUI, ValueTrue)
	if !FromTUI() {
		t.Fatal("expected true when set")
	}
}

func TestChildEnv(t *testing.T) {
	if ChildEnv() != "EIP_FROM_TUI=1" {
		t.Fatalf("got %q", ChildEnv())
	}
}
