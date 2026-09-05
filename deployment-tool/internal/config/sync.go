// Sync implements eip sync: capacity, Traefik, Grafana, and config mounts.
// Swarm mutations use the Moby Engine API (not `docker service update` CLI).
package config

import (
	"context"
	"fmt"
	"path/filepath"

	"eve-industry-planner/deployment-tool/internal/catalogue"
	"eve-industry-planner/deployment-tool/internal/docker"
	"eve-industry-planner/deployment-tool/internal/kit"
	"eve-industry-planner/deployment-tool/internal/msg"
	"eve-industry-planner/deployment-tool/internal/stack"
	"eve-industry-planner/deployment-tool/internal/swarm"
)

// obsOnStack reports whether any observability addon service is deployed.
func obsOnStack(ctx context.Context, stackPrefix string) (bool, error) {
	apiClient, err := docker.NewAPIClient()
	if err != nil {
		return false, fmt.Errorf("observability check: engine API client: %w", err)
	}
	defer apiClient.Close()

	snap, err := docker.LoadStackSnapshot(ctx, apiClient, stackPrefix)
	if err != nil {
		return false, err
	}
	for _, short := range catalogue.ObsShorts() {
		if _, ok := snap.Services[short]; ok {
			return true, nil
		}
	}
	return false, nil
}

// Sync applies capacity, Traefik, Grafana, and file-config mounts from operator YAML.
func Sync(ctx context.Context, dryRun bool) error {
	home, err := kit.Home()
	if err != nil {
		return err
	}
	if err := kit.Require(home, false); err != nil {
		return err
	}

	cfgPath := filepath.Join(home, kit.ConfigFile)
	msg.Step("Validating %s…", kit.ConfigFile)
	cfg, err := LoadYAML(cfgPath)
	if err != nil {
		return err
	}

	msg.Step("Effective policy:")
	for _, line := range cfg.SummaryLines() {
		msg.Line("  " + line)
	}

	stackPrefix := docker.ResolveStackName()
	appPath := filepath.Join(home, kit.AppStackFile)
	doc, err := stack.Load(appPath)
	if err != nil {
		return err
	}
	targets := stack.CapacityTargets(doc, stackPrefix)

	msg.Step("Applying targeted diffs (eip.capacity.sync + traefik ports/paths + network labels + grafana)…")
	msg.Line("(APP_VERSION / image ship is NOT part of eip sync — use eip rebuild or rematerialise)")
	if err := ApplyCapacity(ctx, cfg, targets, doc, dryRun); err != nil {
		return err
	}
	if err := ApplyTraefikConfig(ctx, cfg, appPath, stackPrefix, dryRun); err != nil {
		return err
	}
	if err := ApplyLabeledNetworkMemberships(ctx, cfg, home, stackPrefix, dryRun); err != nil {
		return err
	}
	if err := ApplyGrafanaPath(ctx, cfg, home, stackPrefix, dryRun); err != nil {
		return err
	}

	obsDeployed, err := obsOnStack(ctx, stackPrefix)
	if err != nil {
		return err
	}
	configStacks := []string{kit.DataStackFile, kit.AppStackFile}
	switch {
	case cfg.Addons.Observability.Enabled && !obsDeployed:
		// Sync only patches services that already exist; creating the addon's config
		// objects here would leave them mounted by nothing until a stack deploy runs.
		msg.Step("Observability is enabled but not deployed — run eip repair to add it.")
	case obsDeployed:
		configStacks = append(configStacks, kit.ObsStackFile)
	}

	msg.Step("Applying Swarm file-config hash diffs (eip.config.sync)…")
	if !dryRun {
		// Ensure hashed objects exist before Apply mount-rolls them.
		if _, err := swarm.SyncConfigs(ctx, home, configStacks...); err != nil {
			return err
		}
	}
	if err := swarm.ApplyConfigs(ctx, home, stackPrefix, dryRun, configStacks...); err != nil {
		return fmt.Errorf("config apply: %w", err)
	}
	return nil
}
