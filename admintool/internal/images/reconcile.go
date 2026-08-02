package images

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/moby/moby/client"

	"eve-industry-planner/admintool/internal/catalog"
	"eve-industry-planner/admintool/internal/docker"
	"eve-industry-planner/admintool/internal/msg"
)

// ReconcileLive force-updates Swarm services whose running task digest differs
// from the local post-pull image digest. No-op when the stack is down.
func ReconcileLive(ctx context.Context, home string, wantObs bool) error {
	refs, err := LiveImageRefs(home, wantObs)
	if err != nil {
		return err
	}
	byService := map[string]string{}
	for _, r := range refs {
		byService[r.Service] = r.Image
	}

	apiClient, err := docker.NewAPIClient(client.WithTimeout(2 * time.Minute))
	if err != nil {
		return fmt.Errorf("reconcile: engine API client: %w", err)
	}
	defer apiClient.Close()

	snapCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	snap, err := docker.LoadStackSnapshot(snapCtx, apiClient, docker.ResolveStackName())
	cancel()
	if err != nil {
		return fmt.Errorf("reconcile: stack snapshot: %w", err)
	}
	if !snap.Present {
		msg.Step("Reconcile: stack not running — skip force-update")
		return nil
	}

	order := reconcileOrder(byService, snap)
	var forced int
	for _, short := range order {
		img := byService[short]
		info, ok := snap.Services[short]
		if !ok {
			continue
		}
		runDig := info.RunningImageDigest()
		if runDig == "" {
			continue
		}
		localDig, err := imageDigest(ctx, apiClient, img)
		if err != nil {
			return fmt.Errorf("reconcile %s: local digest: %w", short, err)
		}
		if DigestsMatch(localDig, runDig) {
			continue
		}
		msg.Step("  force-update %s (digest drift)", short)
		if err := docker.ForceUpdateService(ctx, apiClient, info.FullName); err != nil {
			return fmt.Errorf("reconcile %s: %w", short, err)
		}
		forced++
	}
	if forced == 0 {
		msg.Step("Reconcile: all running images match pulled digests")
	} else {
		msg.Step("Reconcile: force-updated %d service(s)", forced)
	}
	return nil
}

func reconcileOrder(byService map[string]string, snap docker.StackSnapshot) []string {
	cands := make(map[string]struct{}, len(byService))
	for short := range byService {
		if _, ok := snap.Services[short]; !ok {
			continue
		}
		cands[short] = struct{}{}
	}
	return catalog.OrderPrefer(cands)
}

// DigestsMatch reports whether two digests name the same content.
func DigestsMatch(a, b string) bool {
	a = normalizeDigest(a)
	b = normalizeDigest(b)
	if a == "" || b == "" {
		return false
	}
	return a == b
}

func normalizeDigest(d string) string {
	d = strings.TrimSpace(strings.ToLower(d))
	if d == "" {
		return ""
	}
	// RepoDigests sometimes return repo@sha256:… — keep digest only.
	if i := strings.LastIndex(d, "@"); i >= 0 {
		d = d[i+1:]
	}
	return d
}
