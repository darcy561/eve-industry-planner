// Sync implements eip sync: capacity, Traefik, Grafana, and config mounts.
package eipconfig

import (
	"context"
	"fmt"
	"path/filepath"

	"eve-industry-planner/admintool/internal/docker"
	"eve-industry-planner/admintool/internal/dockercli"
	"eve-industry-planner/admintool/internal/kit"
	"eve-industry-planner/admintool/internal/msg"
	"eve-industry-planner/admintool/internal/stack"
	"eve-industry-planner/admintool/internal/swarm"
)

// Sync applies capacity, Traefik, Grafana, and file-config mounts from operator YAML.
func Sync(ctx context.Context, dryRun bool) error {
	if err := dockercli.LookPath(); err != nil {
		return err
	}
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

	msg.Step("Applying targeted diffs (eip.capacity.sync + traefik ports/paths + grafana path)…")
	msg.Line("(APP_VERSION / image ship is NOT part of eip sync — use eip rebuild or rematerialize)")
	if err := ApplyCapacity(ctx, cfg, targets, doc, dryRun); err != nil {
		return err
	}
	if err := ApplyTraefikConfig(ctx, cfg, appPath, stackPrefix, dryRun); err != nil {
		return err
	}
	if err := ApplyGrafanaPath(ctx, cfg, home, stackPrefix, dryRun); err != nil {
		return err
	}

	configStacks := []string{kit.DataStackFile}
	if cfg.Addons.Observability.Enabled {
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
