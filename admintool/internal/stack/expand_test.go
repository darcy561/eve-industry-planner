package stack

import (
	"context"
	"strings"
	"testing"
)

func TestExpandGuards(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	cases := []struct {
		name string
		opts Opts
		sub  string
	}{
		{"empty home", Opts{Source: "live", StackFiles: []string{"a.yml"}}, "empty home"},
		{"no files", Opts{Home: "/tmp", Source: "live"}, "no stack files"},
		{"bad source", Opts{Home: "/tmp", Source: "mixed", StackFiles: []string{"a.yml"}}, "live or dev"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			_, err := Expand(ctx, tc.opts)
			if err == nil || !strings.Contains(err.Error(), tc.sub) {
				t.Fatalf("got %v, want substring %q", err, tc.sub)
			}
		})
	}
}

func TestStripConfigsAndSecrets(t *testing.T) {
	t.Parallel()
	in := `
name: demo
services:
  api:
    image: x
    secrets:
      - MONGO_PASSWORD
    configs:
      - source: cfg
        target: /cfg
  worker:
    image: y
configs:
  cfg:
    file: ./cfg.yml
secrets:
  MONGO_PASSWORD:
    external: true
`
	text, err := stripConfigsBlock(in)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(text, "file: ./cfg.yml") {
		t.Fatalf("top-level configs remain:\n%s", text)
	}
	if !strings.Contains(text, "source: cfg") {
		t.Fatalf("service config mount stripped:\n%s", text)
	}

	text, err = stripSecrets(text)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(text, "MONGO_PASSWORD") {
		t.Fatalf("secrets remain:\n%s", text)
	}
	if !strings.Contains(text, "source: cfg") {
		t.Fatalf("config mount lost after stripSecrets:\n%s", text)
	}
}

func TestInjectSourceLabelsPreservesListForm(t *testing.T) {
	t.Parallel()
	in := `
services:
  api:
    image: x
    deploy:
      labels:
        - "traefik.enable=true"
        - "eip.capacity.sync=1"
  worker:
    image: y
`
	out, err := injectSourceLabels(in, "dev")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(out, "eip.deploy.source") || !strings.Contains(out, "dev") {
		t.Fatalf("missing deploy source:\n%s", out)
	}
	if !strings.Contains(out, "traefik.enable") {
		t.Fatalf("traefik label lost:\n%s", out)
	}
	if !strings.Contains(out, "eip.capacity.sync") {
		t.Fatalf("capacity label lost:\n%s", out)
	}
	// both services get the stamp
	if strings.Count(out, "eip.deploy.source") < 2 {
		t.Fatalf("expected label on both services:\n%s", out)
	}
}

func TestInjectSourceLabelsMapForm(t *testing.T) {
	t.Parallel()
	in := `
services:
  api:
    deploy:
      labels:
        traefik.enable: "true"
`
	out, err := injectSourceLabels(in, "live")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(out, "traefik.enable") || !strings.Contains(out, "live") {
		t.Fatalf("bad inject:\n%s", out)
	}
}

func TestPublishedQuotedUnquote(t *testing.T) {
	t.Parallel()
	in := "    published: \"27017\"\n"
	out := publishedQuoted.ReplaceAllString(in, `${1}$2`)
	if out != "    published: 27017\n" {
		t.Fatalf("%q", out)
	}
}

func TestNormalizeModeNumbers(t *testing.T) {
	t.Parallel()
	in := "              mode: \"0755\"\n"
	out := normalizeModeNumbers(in)
	if out != "              mode: 493\n" {
		t.Fatalf("%q", out)
	}
	// already numeric — unchanged
	if got := normalizeModeNumbers("              mode: 493\n"); got != "              mode: 493\n" {
		t.Fatalf("%q", got)
	}
}
