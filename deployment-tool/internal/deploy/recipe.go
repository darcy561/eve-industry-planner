package deploy

import (
	"context"
	"fmt"
	"path/filepath"
	"time"

	"github.com/moby/moby/client"

	"eve-industry-planner/deployment-tool/internal/config"
	"eve-industry-planner/deployment-tool/internal/dataplane"
	"eve-industry-planner/deployment-tool/internal/docker"
	"eve-industry-planner/deployment-tool/internal/dockercli"
	"eve-industry-planner/deployment-tool/internal/engine"
	"eve-industry-planner/deployment-tool/internal/images"
	"eve-industry-planner/deployment-tool/internal/kit"
	"eve-industry-planner/deployment-tool/internal/msg"
	"eve-industry-planner/deployment-tool/internal/stack"
	"eve-industry-planner/deployment-tool/internal/swarm"
)

// Run brings up the Swarm stack (two-pass deploy + data-plane Ready gate).
// If the stack was already healthy before bring-up, Ready/ensure is skipped.
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

	// Ready may SwarmInit / create overlays — longer than DefaultClientTimeout (probe).
	apiClient, err := docker.NewAPIClient(client.WithTimeout(2 * time.Minute))
	if err != nil {
		return fmt.Errorf("engine API client: %w", err)
	}
	defer apiClient.Close()

	msg.Step("Preparing Swarm engine…")
	stackFiles := []string{kit.AppStackFile, kit.DataStackFile}
	if wantObs {
		stackFiles = append(stackFiles, kit.ObsStackFile)
	}
	engCtx, cancel := context.WithTimeout(ctx, 2*time.Minute)
	err = engine.Ready(engCtx, apiClient, home, stackFiles...)
	cancel()
	if err != nil {
		return err
	}

	stackName := docker.ResolveStackName()
	// Skip long Ensure when the stack was already healthy before this bring-up
	// (re-run of up/dev). Cold start / amber/red still run dataplane.Ready.
	skipReady := stackAlreadyHealthy(ctx, apiClient, stackName)

	var expandEnv map[string]string
	switch src {
	case SourceLive:
		if err := images.PullLive(ctx, home, wantObs); err != nil {
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

	mode := string(src)
	msg.Step("Deploying stack %s (%s) — data…", stackName, mode)
	if err := stackDeploy(ctx, home, stackName, []string{expanded.Data}, false); err != nil {
		return err
	}

	if skipReady {
		msg.Step("Stack already healthy — skipping ensure")
	} else {
		msg.Step("Checking data plane…")
		// S3 + mongo Ensure (RS/users/preimages/indexes). Index builds have no short
		// deadline — progress via msg; cancel with process interrupt only.
		if err := dataplane.Ready(ctx, stackName); err != nil {
			return err
		}
	}

	msg.Step("Deploying stack %s (%s) — data+app…", stackName, mode)
	if expanded.Obs != "" {
		msg.Step("  (+ observability addon)")
	}
	if err := stackDeploy(ctx, home, stackName, expanded.fullFiles(), true); err != nil {
		return err
	}

	swarm.PruneStale(ctx, expanded.Secrets)
	if src == SourceLive {
		if err := images.ReconcileLive(ctx, home, wantObs); err != nil {
			return err
		}
	}
	if wantObs {
		msg.Step("Done (%s, observability on). Run: eip status", mode)
	} else {
		msg.Step("Done (%s). Run: eip status", mode)
	}
	return nil
}

// stackAlreadyHealthy reports whether the named stack currently rolls up green.
func stackAlreadyHealthy(ctx context.Context, apiClient *client.Client, stackName string) bool {
	snap, err := docker.LoadStackSnapshotWithHealth(ctx, apiClient, stackName)
	if err != nil {
		return false
	}
	light, _ := snap.HealthSummary()
	return light == docker.HealthGreen
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
