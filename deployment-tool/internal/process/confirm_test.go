package process

import (
	"os"
	"testing"
)

func TestConfirmYesForced(t *testing.T) {
	t.Setenv(EnvFromTUI, "")
	if !Confirm("ignored", true) {
		t.Fatal("yes=true should confirm")
	}
}

func TestConfirmFromTUI(t *testing.T) {
	t.Setenv(EnvFromTUI, ValueTrue)
	if !Confirm("ignored", false) {
		t.Fatal("FromTUI should confirm without yes")
	}
}

func TestConfirmNonTTYWithoutYes(t *testing.T) {
	t.Setenv(EnvFromTUI, "")
	null, err := os.Open(os.DevNull)
	if err != nil {
		t.Fatal(err)
	}
	defer null.Close()
	old := os.Stdin
	os.Stdin = null
	defer func() { os.Stdin = old }()

	if Confirm("would prompt", false) {
		t.Fatal("non-interactive without -y should refuse")
	}
}
