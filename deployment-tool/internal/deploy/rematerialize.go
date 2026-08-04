package deploy

import (
	"context"
	"fmt"
	"path/filepath"

	"eve-industry-planner/deployment-tool/internal/config"
	"eve-industry-planner/deployment-tool/internal/docker"
	"eve-industry-planner/deployment-tool/internal/dockercli"
	"eve-industry-planner/deployment-tool/internal/images"
	"eve-industry-planner/deployment-tool/internal/kit"
	"eve-industry-planner/deployment-tool/internal/msg"
	"eve-industry-planner/deployment-tool/internal/swarm"
)

// Rematerialize re-expands and stack-deploys the full stack (data + app + obs).
// Does not bake images, re-init Swarm/engine, or run dataplane.Ready.
// Used after secret value changes so services remount /run/secrets.
// src must be SourceLive or SourceDev (caller chooses; not inferred from Swarm).
func Rematerialize(ctx context.Context, src Source) error {
	if src != SourceLive && src != SourceDev {
		return fmt.Errorf("rematerialize: source must be live or dev (got %q)", src)
	}
	if err := dockercli.LookPath(); err != nil {
		return err
	}

	home, err := kit.Home()
	if err != nil {
		return err
	}
	if err := kit.Require(home, src == SourceDev); err != nil {
		return err
	}

	cfg, err := config.LoadYAML(filepath.Join(home, kit.ConfigFile))
	if err != nil {
		return fmt.Errorf("eip.config.yaml: %w", err)
	}

	var expandEnv map[string]string
	if src == SourceDev {
		msg.Step("Collecting TAG_* from running stack images…")
		expandEnv, err = images.TagsFromStack(ctx, home)
		if err != nil {
			return err
		}
	}

	return stackRedeploy(ctx, home, src, cfg, expandEnv, "Rematerialize")
}

// Rebuild bakes local app images then rematerializes the full stack (dev source).
// Bake only promotes TAG_* when a role's digest changes; unchanged services keep
// their tags so stack deploy does not roll them. Does not re-init Swarm/engine
// or run dataplane.Ready. bakeArgs are forwarded to images.Bake (e.g. "--no-cache").
func Rebuild(ctx context.Context, bakeArgs ...string) error {
	if err := dockercli.LookPath(); err != nil {
		return err
	}

	home, err := kit.Home()
	if err != nil {
		return err
	}
	if err := kit.Require(home, true); err != nil {
		return err
	}

	cfg, err := config.LoadYAML(filepath.Join(home, kit.ConfigFile))
	if err != nil {
		return fmt.Errorf("eip.config.yaml: %w", err)
	}

	expandEnv, err := images.Bake(ctx, home, bakeArgs...)
	if err != nil {
		return err
	}

	return stackRedeploy(ctx, home, SourceDev, cfg, expandEnv, "Rebuild")
}

func stackRedeploy(ctx context.Context, home string, src Source, cfg config.Config, expandEnv map[string]string, label string) error {
	expanded, err := materializeExpanded(ctx, home, src, cfg, expandEnv)
	if err != nil {
		return err
	}
	defer expanded.cleanup()

	stackName := docker.ResolveStackName()
	msg.Step("%s: deploying full stack %s (%s)…", label, stackName, src)
	if expanded.Obs != "" {
		msg.Step("  (+ observability addon)")
	}
	wantObs := cfg.Addons.Observability.Enabled
	// Labeled attach/detach before prune so target overlays still exist for ID match.
	if !wantObs {
		if err := config.ApplyLabeledNetworkMemberships(ctx, cfg, home, stackName, false); err != nil {
			return err
		}
	}
	// data + app (+ obs): Swarm only rolls services whose expanded spec changed.
	if err := stackDeploy(ctx, home, stackName, expanded.fullFiles(), true); err != nil {
		return err
	}
	if wantObs {
		if err := config.ApplyLabeledNetworkMemberships(ctx, cfg, home, stackName, false); err != nil {
			return err
		}
		if err := config.ApplyGrafanaPath(ctx, cfg, home, stackName, false); err != nil {
			return err
		}
	}

	swarm.PruneStale(ctx, expanded.Secrets)
	msg.Step("%s done (%s).", label, src)
	return nil
}
