// Package dockercli shells the docker binary for work the Engine API cannot do.
//
// Remaining exception in this package: stack deploy.
// Compose config lives in internal/stack (raw exec). Buildx bake lives in
// internal/images (raw exec). For Engine/Swarm CRUD use
// internal/docker.NewAPIClient (Moby SDK), not this package.
package dockercli

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"os"
	"os/exec"
	"strings"

	"eve-industry-planner/admintool/internal/kit"
	"eve-industry-planner/admintool/internal/msg"
)

// Verbose reports EIP_VERBOSE / VERBOSE truthy.
func Verbose() bool {
	v := os.Getenv("EIP_VERBOSE")
	if strings.TrimSpace(v) == "" {
		v = os.Getenv("VERBOSE")
	}
	return kit.Truthy(v)
}

// StackDeployOpts configures docker stack deploy.
type StackDeployOpts struct {
	StackName string
	Files     []string // ordered -c paths
	Prune     bool
	Dir       string // working directory (project home)
}

// StackDeploy runs: docker stack deploy [--prune] -c file… <stackName>
// Quiet on success (except "Removing service …" lines); full output on failure.
func StackDeploy(ctx context.Context, opts StackDeployOpts) error {
	if opts.StackName == "" {
		return fmt.Errorf("stack deploy: empty stack name")
	}
	if len(opts.Files) == 0 {
		return fmt.Errorf("stack deploy: no compose files")
	}
	args := []string{"stack", "deploy"}
	if opts.Prune {
		args = append(args, "--prune")
	}
	for _, f := range opts.Files {
		args = append(args, "-c", f)
	}
	args = append(args, opts.StackName)

	cmd := exec.CommandContext(ctx, "docker", args...)
	if opts.Dir != "" {
		cmd.Dir = opts.Dir
	}
	var buf bytes.Buffer
	if Verbose() {
		var stdoutW *msg.LineWriter
		var stdout io.Writer = os.Stdout
		if msg.Enabled() {
			stdoutW = msg.NewLineWriter()
			stdout = stdoutW
		}
		cmd.Stdout = stdout
		cmd.Stderr = os.Stderr
		err := cmd.Run()
		if stdoutW != nil {
			stdoutW.Flush()
		}
		if err != nil {
			return fmt.Errorf("docker stack deploy: %w", err)
		}
		return nil
	}
	cmd.Stdout = &buf
	cmd.Stderr = &buf
	if err := cmd.Run(); err != nil {
		fmt.Fprint(os.Stderr, buf.String())
		return fmt.Errorf("docker stack deploy: %w", err)
	}
	for line := range strings.SplitSeq(buf.String(), "\n") {
		if strings.HasPrefix(line, "Removing service ") {
			msg.Line(line)
		}
	}
	return nil
}

// LookPath reports whether docker is on PATH (needed for stack deploy / bake / compose).
func LookPath() error {
	_, err := exec.LookPath("docker")
	if err != nil {
		return fmt.Errorf("docker is required on PATH")
	}
	return nil
}
