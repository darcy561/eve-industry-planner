package ops

import (
	"context"
	"fmt"
	"maps"
	"slices"
	"strings"
	"time"

	"github.com/moby/moby/client"

	"eve-industry-planner/deployment-tool/internal/catalog"
	"eve-industry-planner/deployment-tool/internal/dataplane"
	"eve-industry-planner/deployment-tool/internal/deploy"
	"eve-industry-planner/deployment-tool/internal/docker"
	"eve-industry-planner/deployment-tool/internal/kit"
	"eve-industry-planner/deployment-tool/internal/msg"
	"eve-industry-planner/deployment-tool/internal/status"
)

// RepairOpts configures eip repair.
type RepairOpts struct {
	DryRun bool
}

// RepairPlan is the heal actions derived from status + health (testable).
type RepairPlan struct {
	Rematerialize bool
	RematSource   deploy.Source
	Ensure        []string // Swarm shorts with a registered dataplane ensure
	ForceUpdate   []string // present + bad (catalog.OrderPrefer)
	Missing       []string
}

// Repair heals an already-deployed unhealthy stack: optional rematerialize for
// missing membership, selective dataplane ensures (registry), force-update bad
// services. No pull/bake/Ready/cold start. Refuse if Swarm inactive / no stack /
// fully healthy.
func Repair(ctx context.Context, opts RepairOpts) error {
	apiClient, err := docker.NewAPIClient(client.WithTimeout(5 * time.Minute))
	if err != nil {
		return fmt.Errorf("engine API client: %w", err)
	}
	defer apiClient.Close()

	probe := docker.Probe(ctx)
	if probe.Err != nil {
		return fmt.Errorf("repair: %w — run: eip doctor", probe.Err)
	}
	if probe.Health == docker.HealthOff {
		return fmt.Errorf("repair: swarm not active — run: eip up")
	}

	home, err := kit.Home()
	if err != nil {
		return fmt.Errorf("project home: %w", err)
	}
	stackName := docker.ResolveStackName()
	snap, err := docker.LoadStackSnapshotWithHealth(ctx, apiClient, stackName)
	if err != nil {
		return err
	}
	if !snap.Present {
		return fmt.Errorf("repair: nothing is running — start with: eip up")
	}

	view := deploy.View{
		Home:      home,
		StackName: snap.Name,
		Snapshot:  snap,
		Source:    deploy.ResolveSource(snap),
		Fragments: deploy.FragmentStates(snap),
	}
	report := status.Build(view)
	plan := BuildRepairPlan(report, snap, view.Source)

	if plan.Empty() {
		return fmt.Errorf("repair: stack looks healthy — use: eip update")
	}

	if opts.DryRun {
		printRepairPlan(plan)
		return nil
	}

	if plan.Rematerialize {
		msg.Step("Rematerializing stack (%s) to restore missing services…", plan.RematSource)
		if err := deploy.Rematerialize(ctx, plan.RematSource); err != nil {
			return err
		}
		snap, err = docker.LoadStackSnapshotWithHealth(ctx, apiClient, stackName)
		if err != nil {
			return err
		}
		// Rematerialize returns before tasks are necessarily Running; wait so
		// RunEnsuresFor does not skip the services we just restored.
		if err := waitForEnsureTasks(ctx, stackName, plan.Ensure); err != nil {
			return err
		}
	}

	if len(plan.Ensure) > 0 {
		msg.Step("Running dataplane ensure for: %s", strings.Join(plan.Ensure, ", "))
		if err := dataplane.RunEnsuresFor(ctx, stackName, plan.Ensure, func(e dataplane.ServiceEnsure) {
			msg.Step("Skipping %s ensure (no running task)", e.Label)
		}); err != nil {
			return err
		}
	}

	// ForceUpdate is only shorts present at plan time; rematerialized
	// (formerly missing) services are not listed — remat already redeployed them.
	for _, short := range plan.ForceUpdate {
		info, ok := snap.Services[short]
		if !ok {
			continue
		}
		msg.Step("Rolling restart: %s", short)
		if err := docker.ForceUpdateService(ctx, apiClient, info.FullName); err != nil {
			return err
		}
	}

	msg.Step("Done. Check with: eip status")
	return nil
}

// BuildRepairPlan selects heal actions from status rows + per-service health scores.
func BuildRepairPlan(report status.Report, snap docker.StackSnapshot, src deploy.Source) RepairPlan {
	bad := map[string]bool{}
	missing := map[string]bool{}

	for _, g := range report.Groups {
		for _, row := range g.Rows {
			if row.Signal != status.OK {
				bad[row.Short] = true
				if _, exists := snap.Services[row.Short]; !exists {
					missing[row.Short] = true
				}
			}
		}
	}
	for short, info := range snap.Services {
		if serviceHealthBad(info) {
			bad[short] = true
		}
	}

	p := RepairPlan{}
	if len(missing) > 0 {
		p.Rematerialize = true
		p.RematSource = deploy.SourceLive
		if src == deploy.SourceDev {
			p.RematSource = deploy.SourceDev
		}
		p.Missing = slices.Sorted(maps.Keys(missing))
	}

	for _, e := range dataplane.ServiceEnsures() {
		if bad[e.Short] {
			p.Ensure = append(p.Ensure, e.Short)
		}
	}

	p.ForceUpdate = orderForceUpdate(bad, snap)
	return p
}

// Empty reports whether the plan has no heal work.
func (p RepairPlan) Empty() bool {
	return !p.Rematerialize && len(p.Ensure) == 0 && len(p.ForceUpdate) == 0
}

func serviceHealthBad(info docker.ServiceInfo) bool {
	if info.Desired == 0 {
		return false
	}
	light := docker.RollupHealth([]docker.ServiceScore{{
		Desired:          info.Desired,
		Running:          info.Running,
		HasFailedDesired: info.HasFailedDesired,
		TaskHealths:      info.TaskHealths,
	}})
	return light == docker.HealthAmber || light == docker.HealthRed
}

// waitForEnsureTasks polls until every registered ensure short has a running
// task, or until ensureTaskWait elapses (then RunEnsuresFor may still skip).
// Shorts are polled together so wall time ≈ max readiness, not the sum.
func waitForEnsureTasks(ctx context.Context, stackName string, shorts []string) error {
	return waitForEnsureTasksIn(ctx, stackName, shorts, dataplane.ServiceEnsures(), ensureTaskWait)
}

// waitForEnsureTasksIn is waitForEnsureTasks over an explicit registry and
// budget, so tests can supply their own ensures.
func waitForEnsureTasksIn(ctx context.Context, stackName string, shorts []string, registry []dataplane.ServiceEnsure, budget time.Duration) error {
	if len(shorts) == 0 {
		return nil
	}
	byShort := make(map[string]dataplane.ServiceEnsure, len(shorts))
	for _, e := range registry {
		byShort[e.Short] = e
	}
	pending := make([]dataplane.ServiceEnsure, 0, len(shorts))
	for _, short := range shorts {
		if e, ok := byShort[short]; ok {
			pending = append(pending, e)
		}
	}
	if len(pending) == 0 {
		return nil
	}

	deadline := time.Now().Add(budget)
	announced := map[string]bool{}
	for len(pending) > 0 {
		next := pending[:0]
		for _, e := range pending {
			up, err := e.TaskRunning(ctx, stackName)
			if err != nil {
				return err
			}
			if up {
				continue
			}
			if !announced[e.Short] {
				msg.Step("Waiting for %s task before ensure…", e.Short)
				announced[e.Short] = true
			}
			next = append(next, e)
		}
		pending = next
		if len(pending) == 0 {
			return nil
		}
		if time.Now().After(deadline) {
			return nil // RunEnsuresFor may still skip
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(3 * time.Second):
		}
	}
	return nil
}

const ensureTaskWait = 2 * time.Minute

func orderForceUpdate(bad map[string]bool, snap docker.StackSnapshot) []string {
	cands := make(map[string]struct{}, len(bad))
	for short := range bad {
		if _, ok := snap.Services[short]; !ok {
			continue
		}
		cands[short] = struct{}{}
	}
	return catalog.OrderPrefer(cands)
}

func printRepairPlan(p RepairPlan) {
	msg.Line("repair dry-run:")
	if p.Rematerialize {
		msg.Line(fmt.Sprintf("  rematerialize: yes (source=%s)", p.RematSource))
		msg.Line(fmt.Sprintf("  missing: %s", strings.Join(p.Missing, ", ")))
	} else {
		msg.Line("  rematerialize: no")
	}
	if len(p.Ensure) == 0 {
		msg.Line("  ensure: (none)")
	} else {
		msg.Line(fmt.Sprintf("  ensure: %s", strings.Join(p.Ensure, ", ")))
	}
	if len(p.ForceUpdate) == 0 {
		msg.Line("  force-update: (none)")
		return
	}
	msg.Line(fmt.Sprintf("  force-update: %s", strings.Join(p.ForceUpdate, ", ")))
}
