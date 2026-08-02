package ops

import (
	"context"
	"fmt"
	"io"
	"os"
	"strings"
	"time"

	"github.com/moby/moby/client"

	"eve-industry-planner/admintool/internal/docker"
	"eve-industry-planner/admintool/internal/msg"
	"eve-industry-planner/admintool/internal/process"
)

// LogsOpts configures eip logs.
type LogsOpts struct {
	Target string // short name, full name, or "all"
	Tail   string
	Follow bool
}

// Logs streams Swarm service logs (Moby ServiceLogs). Under TUI dump mode, writes to stderr
// so the OUTPUT pane captures lines. Follow blocks until ctx cancel / stream end.
func Logs(ctx context.Context, opts LogsOpts) error {
	target := strings.TrimSpace(opts.Target)
	if target == "" {
		return fmt.Errorf("logs: service name required (or \"all\")")
	}
	if opts.Follow && strings.EqualFold(target, "all") {
		return fmt.Errorf("logs: follow (-f) cannot be used with all services; pick one service")
	}

	out := logWriter()
	if strings.EqualFold(target, "all") {
		sorted, err := ListRunning(ctx)
		if err != nil {
			return err
		}
		if len(sorted) == 0 {
			return fmt.Errorf("logs: nothing is running — start with eip up / eip dev")
		}
		apiClient, shortToFull, err := resolveStack(ctx, opts.Follow)
		if err != nil {
			return err
		}
		defer apiClient.Close()
		tail := effectiveTail(opts.Tail)
		for i, short := range sorted {
			full, ok := shortToFull[short]
			if !ok {
				continue
			}
			if i > 0 {
				fmt.Fprintln(out)
			}
			msg.Step("=== logs: %s ===", short)
			if err := streamOne(ctx, apiClient, full, short, docker.ServiceLogsOpts{Tail: tail, Follow: false}, out); err != nil {
				msg.Line(fmt.Sprintf("logs %s: %v", short, err))
			}
		}
		return nil
	}

	return StreamLogs(ctx, opts, out)
}

// StreamLogs writes formatted lines for one service to w (no eipmsg headers).
// Used by the follow logview UI and by Logs for a single target.
func StreamLogs(ctx context.Context, opts LogsOpts, w io.Writer) error {
	target := strings.TrimSpace(opts.Target)
	if target == "" {
		return fmt.Errorf("logs: service name required")
	}
	if opts.Follow && strings.EqualFold(target, "all") {
		return fmt.Errorf("logs: follow (-f) cannot be used with all services; pick one service")
	}
	apiClient, shortToFull, err := resolveStack(ctx, opts.Follow)
	if err != nil {
		return err
	}
	defer apiClient.Close()

	stackName := docker.ResolveStackName()
	short := strings.TrimPrefix(target, stackName+"_")
	full, ok := shortToFull[short]
	if !ok {
		return fmt.Errorf("logs: unknown or not running service %q", target)
	}
	return streamOne(ctx, apiClient, full, short, docker.ServiceLogsOpts{
		Tail:   effectiveTail(opts.Tail),
		Follow: opts.Follow,
	}, w)
}

func effectiveTail(tail string) string {
	if strings.TrimSpace(tail) == "" {
		return "100"
	}
	return tail
}

func resolveStack(ctx context.Context, follow bool) (*client.Client, map[string]string, error) {
	timeout := 2 * time.Minute
	if follow {
		timeout = 24 * time.Hour
	}
	apiClient, err := docker.NewAPIClient(client.WithTimeout(timeout))
	if err != nil {
		return nil, nil, err
	}
	snap, err := docker.LoadStackSnapshot(ctx, apiClient, docker.ResolveStackName())
	if err != nil {
		apiClient.Close()
		return nil, nil, err
	}
	if !snap.Present {
		apiClient.Close()
		return nil, nil, fmt.Errorf("logs: nothing is running — start with eip up / eip dev")
	}
	m := make(map[string]string, len(snap.Services))
	for short, info := range snap.Services {
		m[short] = info.FullName
	}
	return apiClient, m, nil
}

func logWriter() io.Writer {
	if process.FromTUI() {
		return os.Stderr
	}
	return os.Stdout
}

func streamOne(ctx context.Context, apiClient *client.Client, fullName, short string, opts docker.ServiceLogsOpts, w io.Writer) error {
	rc, err := docker.ServiceLogs(ctx, apiClient, fullName, opts)
	if err != nil {
		return err
	}
	defer rc.Close()
	if err := docker.CopyServiceLogsFormatted(w, rc, short); err != nil && ctx.Err() == nil {
		return err
	}
	return nil
}
