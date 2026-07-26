package kit

import (
	"os"
	"path/filepath"
	"testing"
)

func TestHomeUsesWD(t *testing.T) {
	wd, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	home, err := Home()
	if err != nil {
		t.Fatal(err)
	}
	want, _ := filepath.Abs(wd)
	if home != want {
		t.Fatalf("Home=%q want %q", home, want)
	}
}
