package ops

import (
	"os"
	"path/filepath"
	"runtime"
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
	if p.Rematerialize {
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

func TestRepairPlanMissingTriggersRematerialize(t *testing.T) {
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
	if !p.Rematerialize || p.RematSource != deploy.SourceDev {
		t.Fatalf("want rematerialize dev: %+v", p)
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

func TestRepairForceUpdateBeforeEnsure(t *testing.T) {
	t.Parallel()
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime.Caller")
	}
	src, err := os.ReadFile(filepath.Join(filepath.Dir(file), "repair.go"))
	if err != nil {
		t.Fatal(err)
	}
	body := string(src)
	forceIdx := strings.Index(body, "for _, short := range plan.ForceUpdate")
	waitIdx := strings.Index(body, "waitForEnsureTasks(")
	ensureIdx := strings.Index(body, "dataplane.RunEnsuresFor(")
	if forceIdx < 0 || waitIdx < 0 || ensureIdx < 0 {
		t.Fatal("missing force-update / wait / ensure call sites")
	}
	if !(forceIdx < waitIdx && waitIdx < ensureIdx) {
		t.Fatalf("want force-update then wait then ensure; idxs force=%d wait=%d ensure=%d", forceIdx, waitIdx, ensureIdx)
	}
}
