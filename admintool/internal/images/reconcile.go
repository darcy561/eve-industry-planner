package images

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/docker/docker/client"

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

	cli, err := docker.NewClient(client.WithTimeout(docker.DefaultClientTimeout))
	if err != nil {
		return fmt.Errorf("reconcile: docker client: %w", err)
	}
	defer cli.Close()

	snapCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	snap, err := docker.LoadStackSnapshot(snapCtx, cli, docker.ResolveStackName())
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
		localDig, err := imageDigest(ctx, img)
		if err != nil {
			return fmt.Errorf("reconcile %s: local digest: %w", short, err)
		}
		if DigestsMatch(localDig, runDig) {
			continue
		}
		msg.Step("  force-update %s (digest drift)", short)
		if err := docker.ForceUpdateService(ctx, cli, info.FullName); err != nil {
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
	prefer := catalog.RestartPrefer()
	done := map[string]bool{}
	var out []string
	for _, short := range prefer {
		if _, ok := byService[short]; !ok {
			continue
		}
		if _, ok := snap.Services[short]; !ok {
			continue
		}
		out = append(out, short)
		done[short] = true
	}
	rest := make([]string, 0, len(byService))
	for short := range byService {
		if done[short] {
			continue
		}
		if _, ok := snap.Services[short]; !ok {
			continue
		}
		rest = append(rest, short)
	}
	sort.Strings(rest)
	return append(out, rest...)
}

// DigestFromImageRef returns the @digest suffix when present.
func DigestFromImageRef(ref string) string {
	ref = strings.TrimSpace(ref)
	if i := strings.LastIndex(ref, "@"); i >= 0 && i+1 < len(ref) {
		return strings.TrimSpace(ref[i+1:])
	}
	return ""
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
