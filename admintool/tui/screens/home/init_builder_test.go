package home

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestHomeWiresMenuAndDocs(t *testing.T) {
	t.Parallel()
	dir := filepath.Dir(callerFile(t))
	for _, name := range []string{"model.go", "nav.go", "docs.go", "pickers.go"} {
		src, err := os.ReadFile(filepath.Join(dir, name))
		if err != nil {
			t.Fatal(err)
		}
		body := string(src)
		switch name {
		case "model.go":
			for _, want := range []string{
				"ops.SpecialSetup",
				"ops.SpecialMore",
				"showMoreList()",
				"fromMore",
				"onCLIDone(",
			} {
				if !strings.Contains(body, want) {
					t.Fatalf("%s must contain %q", name, want)
				}
			}
		case "nav.go":
			for _, want := range []string{"showMainMenu(", "returnToMoreOrMenu(", "openCommandLine(", "appendOut("} {
				if !strings.Contains(body, want) {
					t.Fatalf("%s must contain %q", name, want)
				}
			}
		case "docs.go":
			for _, want := range []string{
				"openSecretsBuilder(",
				"openSettingsBuilder(",
				"afterDocApply(",
				"initui.NewEnvSession(",
				"initui.NewConfigSession(",
			} {
				if !strings.Contains(body, want) {
					t.Fatalf("%s must contain %q", name, want)
				}
			}
		case "pickers.go":
			if !strings.Contains(body, "pickerChrome(") {
				t.Fatal("pickers must use pickerChrome")
			}
		}
	}
}

func callerFile(t *testing.T) string {
	t.Helper()
	_, file, _, ok := runtime.Caller(1)
	if !ok {
		t.Fatal("runtime.Caller")
	}
	return file
}
