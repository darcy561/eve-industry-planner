// Package ops implements day-2 stack lifecycle verbs (restart, shutdown, logs,
// repair) using the Moby Engine API via internal/docker.NewAPIClient.
package ops

import (
	"context"
	"fmt"
	"maps"
	"slices"
	"strings"
	"time"

	"github.com/moby/moby/client"

	"eve-industry-planner/admintool/internal/catalog"
	"eve-industry-planner/admintool/internal/docker"
	"eve-industry-planner/admintool/internal/msg"
	"eve-industry-planner/admintool/internal/process"
)

// ListRunning returns short names of Swarm services in the stack namespace (sorted).
func ListRunning(ctx context.Context) ([]string, error) {
	apiClient, err := docker.NewAPIClient(client.WithTimeout(30 * time.Second))
	if err != nil {
		return nil, err
	}
	defer apiClient.Close()

	snap, err := docker.LoadStackSnapshot(ctx, apiClient, docker.ResolveStackName())
	if err != nil {
		return nil, err
	}
	if !snap.Present {
		return nil, nil
	}
	return slices.Sorted(maps.Keys(snap.Services)), nil
}

// Restart force-updates one Swarm service or the whole stack (same images).
// target is a short name, full name (eip_api), or "all".
func Restart(ctx context.Context, target string, yes bool) error {
	apiClient, err := docker.NewAPIClient(client.WithTimeout(5 * time.Minute))
	if err != nil {
		return err
	}
	defer apiClient.Close()

	stackName := docker.ResolveStackName()
	snap, err := docker.LoadStackSnapshot(ctx, apiClient, stackName)
	if err != nil {
		return err
	}
	if !snap.Present {
		return fmt.Errorf("restart: nothing is running — start with eip up / eip dev")
	}

	running := make(map[string]struct{}, len(snap.Services))
	for short := range snap.Services {
		running[short] = struct{}{}
	}
	short, all, err := resolveRestartTarget(target, stackName, running)
	if err != nil {
		return err
	}
	if all {
		if !process.Confirm("Restart the whole app with a rolling update (same version). The app should stay up.", yes) {
			return fmt.Errorf("restart: cancelled (pass -y to confirm)")
		}
		return restartAll(ctx, apiClient, snap)
	}
	info := snap.Services[short]
	if !process.Confirm(fmt.Sprintf("Restart %s with a rolling update so the app stays up.", short), yes) {
		return fmt.Errorf("restart: cancelled (pass -y to confirm)")
	}
	msg.Step("Rolling restart: %s", short)
	if err := docker.ForceUpdateService(ctx, apiClient, info.FullName); err != nil {
		return err
	}
	msg.Step("Done. Check with: eip status")
	return nil
}

// resolveRestartTarget maps operator input to a short name or "all".
func resolveRestartTarget(target, stackName string, running map[string]struct{}) (short string, all bool, err error) {
	target = strings.TrimSpace(target)
	if target == "" {
		names := slices.Sorted(maps.Keys(running))
		return "", false, fmt.Errorf("restart: pass a service short name or \"all\" (running: %s)", strings.Join(names, ", "))
	}
	if strings.EqualFold(target, "all") {
		return "", true, nil
	}
	short = strings.TrimPrefix(target, stackName+"_")
	if _, ok := running[short]; !ok {
		return "", false, fmt.Errorf("restart: unknown or not running service %q", target)
	}
	return short, false, nil
}

func restartAll(ctx context.Context, apiClient *client.Client, snap docker.StackSnapshot) error {
	msg.Step("Rolling restart of the whole app (same version)…")
	cands := make(map[string]struct{}, len(snap.Services))
	for short := range snap.Services {
		cands[short] = struct{}{}
	}
	n := 0
	for _, short := range catalog.OrderPrefer(cands) {
		info := snap.Services[short]
		msg.Step("  rolling restart: %s", short)
		if err := docker.ForceUpdateService(ctx, apiClient, info.FullName); err != nil {
			return err
		}
		n++
	}
	if n == 0 {
		return fmt.Errorf("restart: nothing is running — start with eip up / eip dev")
	}
	msg.Step("Done. Check with: eip status")
	return nil
}
