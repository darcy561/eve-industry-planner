package commands

import (
	"strings"
	"testing"
)

func TestRunArgsVersion(t *testing.T) {
	out, err := RunArgs([]string{"--version"})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(out, Version) {
		t.Fatalf("version output %q", out)
	}
}

func TestRunArgsHelp(t *testing.T) {
	out, err := RunArgs([]string{"help"})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(out, "Eve Industry Planner") && !strings.Contains(out, "Available Commands") {
		t.Fatalf("help output %q", out)
	}
}

func TestRunArgsUnknown(t *testing.T) {
	_, err := RunArgs([]string{"not-a-real-verb"})
	if err == nil {
		t.Fatal("expected error")
	}
}

func TestFlagWiring(t *testing.T) {
	cases := []struct {
		cmd  string
		flag string
		sh   string
	}{
		{"sync", "dry-run", "n"},
		{"restart", "yes", "y"},
		{"rekey-mongo", "yes", "y"},
		{"logs", "follow", "f"},
		{"secrets", "dry-run", "n"},
		{"secrets", "dev", ""},
		{"secrets", "live", ""},
	}
	for _, tc := range cases {
		c, _, err := rootCmd.Find([]string{tc.cmd})
		if err != nil {
			t.Fatalf("%s: %v", tc.cmd, err)
		}
		f := c.Flags().Lookup(tc.flag)
		if f == nil {
			t.Fatalf("%s missing --%s", tc.cmd, tc.flag)
		}
		if tc.sh != "" && f.Shorthand != tc.sh {
			t.Fatalf("%s --%s shorthand=%q want %q", tc.cmd, tc.flag, f.Shorthand, tc.sh)
		}
	}
}

func TestEnsureMongoRegistered(t *testing.T) {
	c, _, err := rootCmd.Find([]string{"ensure-mongo"})
	if err != nil {
		t.Fatal(err)
	}
	if c.Name() != "ensure-mongo" {
		t.Fatalf("got %q", c.Name())
	}
}

func TestRestoreMongoKeyfileRegistered(t *testing.T) {
	c, _, err := rootCmd.Find([]string{"restore-mongo-keyfile"})
	if err != nil {
		t.Fatal(err)
	}
	if c.Name() != "restore-mongo-keyfile" {
		t.Fatalf("got %q", c.Name())
	}
}

func TestRekeyMongoRegistered(t *testing.T) {
	c, _, err := rootCmd.Find([]string{"rekey-mongo"})
	if err != nil {
		t.Fatal(err)
	}
	if c.Name() != "rekey-mongo" {
		t.Fatalf("got %q", c.Name())
	}
}
