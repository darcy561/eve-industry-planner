package deploy

import (
	"context"
	"fmt"
	"path/filepath"
	"time"

	"github.com/docker/docker/client"

	"eve-industry-planner/admintool/internal/config"
	"eve-industry-planner/admintool/internal/dataplane"
	"eve-industry-planner/admintool/internal/docker"
	"eve-industry-planner/admintool/internal/dockercli"
	"eve-industry-planner/admintool/internal/engine"
	"eve-industry-planner/admintool/internal/images"
	"eve-industry-planner/admintool/internal/kit"
	"eve-industry-planner/admintool/internal/msg"
	"eve-industry-planner/admintool/internal/stack"
	"eve-industry-planner/admintool/internal/swarm"
)

// Run brings up the Swarm stack (two-pass deploy + data-plane Ready gate).
// src must be SourceLive or SourceDev.
// When eip.config.yaml addons.observability.enabled, merges docker-stack.obs.yml
// into the full deploy (and prunes it when disabled via stack --prune).
func Run(ctx context.Context, src Source) error {
	if src != SourceLive && src != SourceDev {
		return fmt.Errorf("deploy: source must be live or dev")
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
	wantObs := cfg.Addons.Observability.Enabled
	if err := requireObsStack(home, wantObs); err != nil {
		return err
	}

	cli, err := docker.NewClient(client.WithTimeout(docker.DefaultClientTimeout))
	if err != nil {
		return fmt.Errorf("docker client: %w", err)
	}
	defer cli.Close()

	msg.Step("Preparing Swarm engine…")
	stackFiles := []string{kit.AppStackFile, kit.DataStackFile}
	if wantObs {
		stackFiles = append(stackFiles, kit.ObsStackFile)
	}
	engCtx, cancel := context.WithTimeout(ctx, 2*time.Minute)
	err = engine.Ready(engCtx, cli, home, stackFiles...)
	cancel()
	if err != nil {
		return err
	}

	var expandEnv map[string]string
	switch src {
	case SourceLive:
		if err := images.PullLive(ctx, home); err != nil {
			return err
		}
	case SourceDev:
		expandEnv, err = images.Bake(ctx, home)
		if err != nil {
			return err
		}
	}

	expanded, err := materializeExpanded(ctx, home, src, cfg, expandEnv)
	if err != nil {
		return err
	}
	defer expanded.cleanup()

	stackName := docker.ResolveStackName()
	mode := string(src)
	msg.Step("Deploying stack %s (%s) — data…", stackName, mode)
	if err := stackDeploy(ctx, home, stackName, []string{expanded.Data}, false); err != nil {
		return err
	}

	msg.Step("Checking data plane…")
	// S3 + mongo Ensure (RS/users/preimages/indexes). Index builds have no short
	// deadline — progress via msg; cancel with process interrupt only.
	if err := dataplane.Ready(ctx, stackName); err != nil {
		return err
	}

	msg.Step("Deploying stack %s (%s) — data+app…", stackName, mode)
	if expanded.Obs != "" {
		msg.Step("  (+ observability addon)")
	}
	if err := stackDeploy(ctx, home, stackName, expanded.fullFiles(), true); err != nil {
		return err
	}

	swarm.PruneStale(ctx, expanded.Secrets)
	if wantObs {
		msg.Step("Done (%s, observability on). Run: eip status", mode)
	} else {
		msg.Step("Done (%s). Run: eip status", mode)
	}
	return nil
}

func expandFragment(ctx context.Context, label, home string, files []string, env map[string]string, src Source, syncEnv map[string]string) (string, error) {
	msg.Step("Expanding %s stack…", label)
	path, err := stack.Expand(ctx, stack.Opts{
		Home:       home,
		StackFiles: files,
		Env:        env,
		Source:     string(src),
		SyncEnv:    syncEnv,
	})
	if err != nil {
		return "", err
	}
	return path, nil
}

func stackDeploy(ctx context.Context, home, stackName string, files []string, prune bool) error {
	return dockercli.StackDeploy(ctx, dockercli.StackDeployOpts{
		StackName: stackName,
		Files:     files,
		Prune:     prune,
		Dir:       home,
	})
}
