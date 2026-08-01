// Package task is the shared Swarm-task wait/poll helper for dataplane ensures.
// Service packages supply their own ready probes; timeouts stay caller-owned.
package task

import (
	"bytes"
	"context"
	"fmt"
	"os/exec"
	"strings"
	"time"

	"eve-industry-planner/admintool/internal/docker"
)

const (
	DefaultTimeout  = 90 * time.Second
	DefaultInterval = 2 * time.Second
)

// ReadyFunc probes whether a running task container is usable.
// nil means “running container is enough”.
type ReadyFunc func(ctx context.Context, cid string) error

// ContainerID returns the first running container id for stack_service, or "".
func ContainerID(ctx context.Context, stackName, service string) (string, error) {
	if stackName == "" {
		stackName = docker.ResolveStackName()
	}
	if service == "" {
		return "", fmt.Errorf("task: service name required")
	}
	svc := stackName + "_" + service
	cmd := exec.CommandContext(ctx, "docker", "ps", "-q",
		"--filter", "label=com.docker.swarm.service.name="+svc,
		"--filter", "status=running",
	)
	var out bytes.Buffer
	cmd.Stdout = &out
	if err := cmd.Run(); err != nil {
		// CommandContext often surfaces "signal: killed" / "exit status 1" when
		// the parent ctx expires; prefer the context error for callers.
		if ctx.Err() != nil {
			return "", ctx.Err()
		}
		return "", err
	}
	lines := strings.Split(strings.TrimSpace(out.String()), "\n")
	if len(lines) == 0 || strings.TrimSpace(lines[0]) == "" {
		return "", nil
	}
	return strings.TrimSpace(lines[0]), nil
}

// Running reports whether a Swarm task for service is currently running.
func Running(ctx context.Context, stackName, service string) (bool, error) {
	cid, err := ContainerID(ctx, stackName, service)
	if err != nil {
		return false, err
	}
	return cid != "", nil
}

// Wait polls until a running task exists and optional ready succeeds.
// timeout <= 0 defaults to DefaultTimeout; poll interval is DefaultInterval.
func Wait(ctx context.Context, stackName, service string, timeout time.Duration, ready ReadyFunc) (string, error) {
	if timeout <= 0 {
		timeout = DefaultTimeout
	}
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if err := ctx.Err(); err != nil {
			return "", err
		}
		cid, err := ContainerID(ctx, stackName, service)
		if err != nil {
			return "", err
		}
		if cid != "" {
			if ready == nil {
				return cid, nil
			}
			if err := ready(ctx, cid); err == nil {
				return cid, nil
			}
		}
		select {
		case <-ctx.Done():
			return "", ctx.Err()
		case <-time.After(DefaultInterval):
		}
	}
	if ready == nil {
		return "", fmt.Errorf("task: %s did not become running in time", service)
	}
	return "", fmt.Errorf("task: %s did not become ready in time", service)
}

// Retry calls fn until it returns nil, ctx cancels, or timeout elapses.
// last non-nil error from fn is wrapped on timeout when present.
func Retry(ctx context.Context, timeout, every time.Duration, fn func() error) error {
	if every <= 0 {
		every = time.Second
	}
	deadline := time.Now().Add(timeout)
	var last error
	for time.Now().Before(deadline) {
		if err := fn(); err == nil {
			return nil
		} else {
			last = err
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(every):
		}
	}
	if last != nil {
		return fmt.Errorf("timed out after %s: %w", timeout, last)
	}
	return fmt.Errorf("timed out after %s", timeout)
}
