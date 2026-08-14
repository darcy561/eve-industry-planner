package home

import (
	"slices"
	"testing"
)

func TestParseCommandLineHost(t *testing.T) {
	t.Parallel()
	a := parseCommandLine("status")
	if a.Builder != "" || a.Err != "" || !slices.Equal(a.RunArgs, []string{"status"}) {
		t.Fatalf("%+v", a)
	}
	a = parseCommandLine("init")
	if a.Builder != "" || a.Err != "" || !slices.Equal(a.RunArgs, []string{"init"}) {
		t.Fatalf("init must run host eip init, got %+v", a)
	}
	a = parseCommandLine("logs api -f")
	if !slices.Equal(a.RunArgs, []string{"logs", "api", "-f"}) {
		t.Fatalf("%+v", a)
	}
}

func TestParseCommandLineCore(t *testing.T) {
	t.Parallel()
	a := parseCommandLine("list")
	if !slices.Equal(a.RunArgs, []string{"cli", "list"}) {
		t.Fatalf("bare tasks → %+v", a)
	}
	a = parseCommandLine("cli sdeVersion")
	if !slices.Equal(a.RunArgs, []string{"cli", "sdeVersion"}) {
		t.Fatalf("cli prefix → %+v", a)
	}
	a = parseCommandLine("tasks list")
	if !slices.Equal(a.RunArgs, []string{"cli", "list"}) {
		t.Fatalf("tasks prefix → %+v", a)
	}
}

func TestParseCommandLineBuildersAndShell(t *testing.T) {
	t.Parallel()
	if a := parseCommandLine("setup"); a.Builder != "setup" {
		t.Fatalf("%+v", a)
	}
	if a := parseCommandLine("cli"); a.Err == "" {
		t.Fatal("bare cli should error")
	}
	if a := parseCommandLine("shell"); a.Err == "" {
		t.Fatal("shell should error")
	}
}
