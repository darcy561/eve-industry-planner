package stack

import (
	"testing"
)

func TestSubstituteEnv(t *testing.T) {
	t.Parallel()
	in := "PathPrefix(`${EIP_TRAEFIK_DASHBOARD_PATH:-/dashboard}`) || PathPrefix(`/api`)"
	got := SubstituteEnv(in, "EIP_TRAEFIK_DASHBOARD_PATH", "/ops")
	want := "PathPrefix(`/ops`) || PathPrefix(`/api`)"
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}

func TestEnvDefault(t *testing.T) {
	t.Parallel()
	in := "${GRAFANA_ROOT_URL:-http://127.0.0.1/grafana/}"
	if got := EnvDefault(in, "GRAFANA_ROOT_URL"); got != "http://127.0.0.1/grafana/" {
		t.Fatalf("%q", got)
	}
}
