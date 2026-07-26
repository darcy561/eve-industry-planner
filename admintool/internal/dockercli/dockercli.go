// Package dockercli wraps the docker CLI for operations the Engine SDK lacks
// (stack deploy, compose config, buildx bake).
package dockercli

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"os"
	"os/exec"
	"strings"

	"eve-industry-planner/admintool/internal/msg"
	"eve-industry-planner/admintool/internal/kit"
)

// Verbose reports EIP_VERBOSE / VERBOSE truthy.
func Verbose() bool {
	v := os.Getenv("EIP_VERBOSE")
	if strings.TrimSpace(v) == "" {
		v = os.Getenv("VERBOSE")
	}
	return kit.Truthy(v)
}

// Run executes docker with args; inherits stdout/stderr when verbose, else
// buffers and prints only on failure.
func Run(ctx context.Context, args ...string) error {
	_, err := run(ctx, false, args...)
	return err
}

// RunOut executes docker and returns combined stdout+stderr.
func RunOut(ctx context.Context, args ...string) (string, error) {
	return run(ctx, true, args...)
}

// TryOut is like RunOut but never prints buffered output on failure
// (for existence probes where missing is expected).
func TryOut(ctx context.Context, args ...string) (string, error) {
	cmd := exec.CommandContext(ctx, "docker", args...)
	var buf bytes.Buffer
	cmd.Stdout = &buf
	cmd.Stderr = &buf
	err := cmd.Run()
	out := buf.String()
	if err != nil {
		return out, fmt.Errorf("docker %s: %w", strings.Join(args, " "), err)
	}
	return out, nil
}

// ServiceExists reports whether a Swarm service is deployed (quiet on missing).
func ServiceExists(ctx context.Context, name string) bool {
	_, err := TryOut(ctx, "service", "inspect", name, "--format", "{{.ID}}")
	return err == nil
}

func run(ctx context.Context, alwaysCapture bool, args ...string) (string, error) {
	cmd := exec.CommandContext(ctx, "docker", args...)
	var buf bytes.Buffer
	var stdoutW *msg.LineWriter
	if Verbose() && !alwaysCapture {
		if msg.Enabled() {
			stdoutW = msg.NewLineWriter()
			cmd.Stdout = stdoutW
			cmd.Stderr = os.Stderr
		} else {
			cmd.Stdout = os.Stdout
			cmd.Stderr = os.Stderr
		}
	} else {
		cmd.Stdout = &buf
		cmd.Stderr = &buf
	}
	err := cmd.Run()
	if stdoutW != nil {
		stdoutW.Flush()
	}
	out := buf.String()
	if err != nil {
		if out != "" && !(Verbose() && !alwaysCapture) {
			fmt.Fprint(os.Stderr, out)
		}
		return out, fmt.Errorf("docker %s: %w", strings.Join(args, " "), err)
	}
	return out, nil
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
	for _, line := range strings.Split(buf.String(), "\n") {
		if strings.HasPrefix(line, "Removing service ") {
			msg.Line(line)
		}
	}
	return nil
}

// LookPath reports whether docker is on PATH.
func LookPath() error {
	_, err := exec.LookPath("docker")
	if err != nil {
		return fmt.Errorf("docker is required on PATH")
	}
	return nil
}

// CreateStdin runs `docker <kind> create <name> -` with raw on stdin (config or secret).
func CreateStdin(ctx context.Context, kind, name string, raw []byte) error {
	cmd := exec.CommandContext(ctx, "docker", kind, "create", name, "-")
	cmd.Stdin = bytes.NewReader(raw)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		msg := strings.TrimSpace(stderr.String())
		if msg != "" {
			return fmt.Errorf("docker %s create %s: %w: %s", kind, name, err, msg)
		}
		return fmt.Errorf("docker %s create %s: %w", kind, name, err)
	}
	return nil
}
