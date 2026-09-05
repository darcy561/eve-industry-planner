package swarm

import (
	"reflect"
	"testing"
)

func TestDecideConfigRoll(t *testing.T) {
	t.Parallel()
	cases := []struct {
		exists bool
		live   string
		want   string
		action configRollAction
	}{
		{false, "", "eip_k_aaa", configRollSkipMissing},
		{true, "eip_k_aaa", "eip_k_aaa", configRollUnchanged},
		{true, "eip_k_old", "eip_k_aaa", configRollUpdate},
		{true, "", "eip_k_aaa", configRollUpdate},
	}
	for _, tc := range cases {
		if got := decideConfigRoll(tc.exists, tc.live, tc.want); got != tc.action {
			t.Fatalf("exists=%v live=%q want=%q → %v, want %v", tc.exists, tc.live, tc.want, got, tc.action)
		}
	}
}

func TestSupersededObjectNames(t *testing.T) {
	t.Parallel()
	listed := []string{
		"eip_FOO_aaa",
		"eip_FOO_bbb",
		"eip_BAR_ccc",
		"  ",
		"other",
	}
	got := supersededObjectNames(listed, "FOO", "eip_FOO_bbb")
	want := []string{"eip_FOO_aaa"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %#v want %#v", got, want)
	}
}

func TestStaleConfigNames(t *testing.T) {
	keep := map[string]struct{}{"eip_loki_yml_aaa": {}}
	got := staleConfigNames([]string{
		"eip_loki_yml_aaa",
		"eip_loki_yml_bbb",
		"eip_grafana_dash_gone_ccc",
		"unrelated_config",
		"  ",
	}, keep)
	want := []string{"eip_loki_yml_bbb", "eip_grafana_dash_gone_ccc"}
	if len(got) != len(want) {
		t.Fatalf("got %v want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("got %v want %v", got, want)
		}
	}
}
