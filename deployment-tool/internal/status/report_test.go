package status

import (
	"encoding/json"
	"strings"
	"testing"

	"eve-industry-planner/deployment-tool/internal/deploy"
	"eve-industry-planner/deployment-tool/internal/docker"
)

func TestBuildOmitsObsWhenAbsent(t *testing.T) {
	v := deploy.View{
		StackName: "eip",
		Home:      "/tmp/kit",
		Source:    deploy.SourceLive,
		Snapshot: docker.StackSnapshot{
			Present: true,
			Name:    "eip",
			Services: map[string]docker.ServiceInfo{
				"api": {Short: "api", Desired: 1, Running: 1},
			},
		},
		Fragments: deploy.FragmentStates(docker.StackSnapshot{
			Present:  true,
			Services: map[string]docker.ServiceInfo{"api": {}},
		}),
	}
	r := Build(v)
	for _, g := range r.Groups {
		if g.Title == "Observability" {
			t.Fatal("obs group should be omitted when no obs services on stack")
		}
	}
	if r.Source != "live" {
		t.Fatal(r.Source)
	}

	out := FormatPlain(r)
	if !strings.HasPrefix(out, "── App ──") {
		t.Fatal(out)
	}
	if !strings.Contains(out, "Source") || !strings.Contains(out, "live") {
		t.Fatal(out)
	}
	if !strings.Contains(out, "stack eip deployed") {
		t.Fatal(out)
	}
	if strings.Contains(out, "── Observability ──") || strings.Contains(out, "App helpers") {
		t.Fatal(out)
	}
	if strings.Contains(out, "\033[") {
		t.Fatal("FormatPlain must not emit ANSI")
	}
}

func TestBuildIncludesObsWhenPresent(t *testing.T) {
	snap := docker.StackSnapshot{
		Present: true,
		Services: map[string]docker.ServiceInfo{
			"grafana": {Short: "grafana", Desired: 1, Running: 1},
		},
	}
	v := deploy.View{
		StackName: "eip",
		Snapshot:  snap,
		Fragments: deploy.FragmentStates(snap),
	}
	r := Build(v)
	found := false
	for _, g := range r.Groups {
		if g.Title == "Observability" {
			found = true
		}
	}
	if !found {
		t.Fatal("expected obs group")
	}
}

func TestBuildIncludesObsWhenEnabledButUndeployed(t *testing.T) {
	snap := docker.StackSnapshot{
		Present:  true,
		Name:     "eip",
		Services: map[string]docker.ServiceInfo{"api": {Short: "api", Desired: 1, Running: 1}},
	}
	v := deploy.View{
		StackName:  "eip",
		Snapshot:   snap,
		Fragments:  deploy.FragmentStates(snap),
		ObsEnabled: true,
	}
	r := Build(v)
	var obs *GroupSection
	for i, g := range r.Groups {
		if g.Title == "Observability" {
			obs = &r.Groups[i]
		}
	}
	if obs == nil {
		t.Fatal("enabled addon must report its services, not hide the group")
	}
	for _, row := range obs.Rows {
		if row.Signal == OK {
			t.Fatalf("undeployed %s must not read OK", row.Short)
		}
	}
	if r.OpsBad != len(obs.Rows) {
		t.Fatalf("OpsBad=%d rows=%d", r.OpsBad, len(obs.Rows))
	}
}

func TestReportJSONRoundTrip(t *testing.T) {
	r := Report{
		StackName:    "eip",
		StackPresent: true,
		Source:       "live",
		Overall:      OK,
		Groups: []GroupSection{
			{Title: "App", Rows: []ServiceRow{{Label: "API", Signal: OK, Detail: "1/1 up"}}},
		},
	}
	b, err := json.Marshal(r)
	if err != nil {
		t.Fatal(err)
	}
	var got Report
	if err := json.Unmarshal(b, &got); err != nil {
		t.Fatal(err)
	}
	if got.StackName != "eip" || got.Overall != OK || len(got.Groups) != 1 {
		t.Fatalf("%+v", got)
	}
}
