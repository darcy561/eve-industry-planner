package ops

import (
	"slices"
	"strings"
	"testing"

	"eve-industry-planner/deployment-tool/internal/dataplane"
	"eve-industry-planner/deployment-tool/internal/deploy"
	"eve-industry-planner/deployment-tool/internal/docker"
	"eve-industry-planner/deployment-tool/internal/status"
)

func TestRepairPlanEmptyHealthy(t *testing.T) {
	t.Parallel()
	snap := docker.StackSnapshot{
		Present: true,
		Services: map[string]docker.ServiceInfo{
			"api": {Short: "api", FullName: "eip_api", Desired: 1, Running: 1},
		},
	}
	report := status.Report{
		StackPresent: true,
		Groups: []status.GroupSection{{
			Rows: []status.ServiceRow{
				{Short: "api", Signal: status.OK},
			},
		}},
	}
	p := BuildRepairPlan(report, snap, deploy.SourceLive)
	if !p.Empty() {
		t.Fatalf("want empty plan, got %+v", p)
	}
}

func TestRepairPlanRematerialisesEnabledButUndeployedObs(t *testing.T) {
	t.Parallel()
	snap := docker.StackSnapshot{
		Present: true,
		Services: map[string]docker.ServiceInfo{
			"api": {Short: "api", FullName: "eip_api", Desired: 1, Running: 1},
		},
	}
	// The shape status.Build produces when the addon is on with nothing deployed.
	report := status.Report{
		StackPresent: true,
		Groups: []status.GroupSection{{
			Title: "Observability",
			Rows: []status.ServiceRow{
				{Short: "grafana", Signal: status.Down},
				{Short: "alloy", Signal: status.Down},
			},
		}},
	}
	p := BuildRepairPlan(report, snap, deploy.SourceLive)
	if !p.Rematerialise {
		t.Fatal("enabled-but-undeployed addon must rematerialise")
	}
	if p.RematSource != deploy.SourceLive {
		t.Fatalf("source=%v", p.RematSource)
	}
}

func TestRepairPlanUndeploysDisabledObs(t *testing.T) {
	t.Parallel()
	snap := docker.StackSnapshot{
		Present: true,
		Services: map[string]docker.ServiceInfo{
			"api":     {Short: "api", FullName: "eip_api", Desired: 1, Running: 1},
			"grafana": {Short: "grafana", FullName: "eip_grafana", Desired: 1, Running: 1},
		},
	}
	// Everything healthy: only the config disagreeing with the stack drives this.
	report := status.Report{
		StackPresent: true,
		ObsEnabled:   false,
		Groups: []status.GroupSection{{
			Title: "Observability",
			Rows:  []status.ServiceRow{{Short: "grafana", Signal: status.OK}},
		}},
	}
	p := BuildRepairPlan(report, snap, deploy.SourceDev)
	if !p.Rematerialise || !p.ObsUndeploy {
		t.Fatalf("want undeploy remat, got %+v", p)
	}
	if p.RematSource != deploy.SourceDev {
		t.Fatalf("source=%v", p.RematSource)
	}
	if p.Empty() {
		t.Fatal("plan must not read as empty")
	}
}

func TestRepairPlanLeavesEnabledObsDeployed(t *testing.T) {
	t.Parallel()
	snap := docker.StackSnapshot{
		Present: true,
		Services: map[string]docker.ServiceInfo{
			"grafana": {Short: "grafana", FullName: "eip_grafana", Desired: 1, Running: 1},
		},
	}
	report := status.Report{
		StackPresent: true,
		ObsEnabled:   true,
		Groups: []status.GroupSection{{
			Title: "Observability",
			Rows:  []status.ServiceRow{{Short: "grafana", Signal: status.OK}},
		}},
	}
	if p := BuildRepairPlan(report, snap, deploy.SourceLive); !p.Empty() {
		t.Fatalf("enabled and healthy must be a no-op, got %+v", p)
	}
}

func TestRepairPlanSelectiveEnsureAndForce(t *testing.T) {
	t.Parallel()
	snap := docker.StackSnapshot{
		Present: true,
		Services: map[string]docker.ServiceInfo{
			"api":       {Short: "api", FullName: "eip_api", Desired: 1, Running: 0},
			"mongo":     {Short: "mongo", FullName: "eip_mongo", Desired: 1, Running: 1, TaskHealths: []docker.TaskHealth{docker.TaskHealthUnhealthy}},
			"seaweedfs": {Short: "seaweedfs", FullName: "eip_seaweedfs", Desired: 1, Running: 1},
			"redis":     {Short: "redis", FullName: "eip_redis", Desired: 1, Running: 1},
		},
	}
	report := status.Report{
		StackPresent: true,
		Groups: []status.GroupSection{{
			Rows: []status.ServiceRow{
				{Short: "api", Signal: status.Down},
				{Short: "mongo", Signal: status.OK},
				{Short: "seaweedfs", Signal: status.OK},
				{Short: "redis", Signal: status.OK},
			},
		}},
	}
	p := BuildRepairPlan(report, snap, deploy.SourceLive)
	if p.Rematerialise {
		t.Fatalf("unexpected remat: %+v", p)
	}
	if !slices.Contains(p.Ensure, "mongo") {
		t.Fatalf("want mongo ensure: %v", p.Ensure)
	}
	if slices.Contains(p.Ensure, "seaweedfs") {
		t.Fatalf("seaweedfs healthy — no ensure: %v", p.Ensure)
	}
	joined := strings.Join(p.ForceUpdate, ",")
	if !strings.Contains(joined, "api") || !strings.Contains(joined, "mongo") {
		t.Fatalf("force-update=%v", p.ForceUpdate)
	}
	if strings.Contains(joined, "redis") {
		t.Fatalf("redis should not force-update: %v", p.ForceUpdate)
	}
}

func TestRepairPlanMissingTriggersRematerialise(t *testing.T) {
	t.Parallel()
	snap := docker.StackSnapshot{
		Present: true,
		Services: map[string]docker.ServiceInfo{
			"api": {Short: "api", FullName: "eip_api", Desired: 1, Running: 1},
		},
	}
	report := status.Report{
		StackPresent: true,
		Groups: []status.GroupSection{{
			Rows: []status.ServiceRow{
				{Short: "api", Signal: status.OK},
				{Short: "mongo", Signal: status.Down},
				{Short: "seaweedfs", Signal: status.Down},
			},
		}},
	}
	p := BuildRepairPlan(report, snap, deploy.SourceDev)
	if !p.Rematerialise || p.RematSource != deploy.SourceDev {
		t.Fatalf("want rematerialise dev: %+v", p)
	}
	if len(p.Missing) != 2 {
		t.Fatalf("missing=%v", p.Missing)
	}
	for _, e := range dataplane.ServiceEnsures() {
		if !slices.Contains(p.Ensure, e.Short) {
			t.Fatalf("want ensure %s when missing: %v", e.Short, p.Ensure)
		}
	}
	for _, s := range p.ForceUpdate {
		if dataplane.HasServiceEnsure(s) {
			t.Fatalf("missing ensure-service should not be in force-update: %v", p.ForceUpdate)
		}
	}
}

func TestRepairPlanEnsureOnlyFromRegistry(t *testing.T) {
	t.Parallel()
	snap := docker.StackSnapshot{
		Present: true,
		Services: map[string]docker.ServiceInfo{
			"redis": {Short: "redis", FullName: "eip_redis", Desired: 1, Running: 0},
		},
	}
	report := status.Report{
		StackPresent: true,
		Groups: []status.GroupSection{{
			Rows: []status.ServiceRow{{Short: "redis", Signal: status.Down}},
		}},
	}
	p := BuildRepairPlan(report, snap, deploy.SourceLive)
	if len(p.Ensure) != 0 {
		t.Fatalf("redis has no ensure registry entry: %v", p.Ensure)
	}
	if len(p.ForceUpdate) != 1 || p.ForceUpdate[0] != "redis" {
		t.Fatalf("force-update=%v", p.ForceUpdate)
	}
}
