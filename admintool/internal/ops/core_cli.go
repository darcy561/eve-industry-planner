package ops

import (
	"context"
	"fmt"
	"io"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/moby/moby/api/pkg/stdcopy"
	"github.com/moby/moby/api/types/swarm"
	"github.com/moby/moby/client"
	"golang.org/x/term"

	"eve-industry-planner/admintool/internal/docker"
	"eve-industry-planner/admintool/internal/msg"
	"eve-industry-planner/admintool/internal/process"
)

const (
	defaultCLIWaitSec = 180
	defaultCLIPollSec = 2
)

// CLIOpts configures eip cli (core tasks / interactive shell).
type CLIOpts struct {
	Args []string // tasks subcommand args; empty or ["shell"] → interactive shell
}

// CLI runs a one-shot `tasks …` on the post-handoff core container, or opens
// an interactive shell when Args is empty / "shell".
//
// Mid-roll: waits until Swarm leaves exactly one new core owner.
// Overrides: EIP_CORE_CONTAINER, EIP_CORE_SERVICE,
// EIP_CLI_WAIT_SEC, EIP_CLI_POLL_SEC, EIP_CLI_SHELL.
func CLI(ctx context.Context, opts CLIOpts) error {
	args := opts.Args
	if len(args) == 1 && args[0] == "shell" {
		args = nil
	}
	if len(args) == 0 {
		return openShell(ctx)
	}
	return runTasks(ctx, args)
}

func coreServiceName() string {
	if v := strings.TrimSpace(os.Getenv("EIP_CORE_SERVICE")); v != "" {
		return v
	}
	return docker.ResolveStackName() + "_core"
}

func cliWaitTimeout() time.Duration {
	return envDurationSec("EIP_CLI_WAIT_SEC", defaultCLIWaitSec)
}

func cliPollInterval() time.Duration {
	return envDurationSec("EIP_CLI_POLL_SEC", defaultCLIPollSec)
}

func envDurationSec(key string, def int) time.Duration {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return time.Duration(def) * time.Second
	}
	n, err := strconv.Atoi(v)
	if err != nil || n <= 0 {
		return time.Duration(def) * time.Second
	}
	return time.Duration(n) * time.Second
}

type coreContainer struct {
	ID   string
	Name string
}

func (c coreContainer) display() string {
	if c.Name != "" {
		return c.Name
	}
	if len(c.ID) > 12 {
		return c.ID[:12]
	}
	return c.ID
}

func resolveCoreContainer(ctx context.Context, apiClient *client.Client) (coreContainer, error) {
	if override := strings.TrimSpace(os.Getenv("EIP_CORE_CONTAINER")); override != "" {
		return coreContainer{ID: override, Name: override}, nil
	}

	service := coreServiceName()
	if _, err := apiClient.ServiceInspect(ctx, service, client.ServiceInspectOptions{}); err != nil {
		return coreContainer{}, fmt.Errorf("cli: service %q not found (is the stack deployed?): %w", service, err)
	}

	state, stateMsg, err := coreUpdateState(ctx, apiClient, service)
	if err != nil {
		return coreContainer{}, err
	}
	if err := failBadUpdate(state, stateMsg); err != nil {
		return coreContainer{}, err
	}

	running, err := listRunningCore(ctx, apiClient, service)
	if err != nil {
		return coreContainer{}, err
	}
	if state == string(swarm.UpdateStateUpdating) || len(running) != 1 {
		var baseline []string
		if state == string(swarm.UpdateStateUpdating) {
			baseline = namesOf(running)
		}
		if err := waitForStableOwner(ctx, apiClient, service, baseline); err != nil {
			return coreContainer{}, err
		}
		running, err = listRunningCore(ctx, apiClient, service)
		if err != nil {
			return coreContainer{}, err
		}
	}
	if len(running) == 0 {
		return coreContainer{}, fmt.Errorf("cli: no running %q containers", service)
	}
	if len(running) != 1 {
		return coreContainer{}, fmt.Errorf("cli: expected 1 running %q container after handoff, found %d: %s",
			service, len(running), strings.Join(namesOf(running), " "))
	}
	return running[0], nil
}

func coreUpdateState(ctx context.Context, apiClient *client.Client, service string) (state, message string, err error) {
	res, err := apiClient.ServiceInspect(ctx, service, client.ServiceInspectOptions{})
	if err != nil {
		return "", "", err
	}
	if res.Service.UpdateStatus == nil {
		return "", "", nil
	}
	return string(res.Service.UpdateStatus.State), res.Service.UpdateStatus.Message, nil
}

func failBadUpdate(state, message string) error {
	switch swarm.UpdateState(state) {
	case swarm.UpdateStatePaused, swarm.UpdateStateRollbackStarted, swarm.UpdateStateRollbackPaused:
		if message != "" {
			return fmt.Errorf("cli: core handoff issue: UpdateStatus.State=%s (%s)", state, message)
		}
		return fmt.Errorf("cli: core handoff issue: UpdateStatus.State=%s", state)
	default:
		return nil
	}
}

func listRunningCore(ctx context.Context, apiClient *client.Client, service string) ([]coreContainer, error) {
	f := make(client.Filters)
	f.Add("label", docker.LabelSwarmServiceName+"="+service)
	f.Add("status", "running")
	list, err := apiClient.ContainerList(ctx, client.ContainerListOptions{Filters: f})
	if err != nil {
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		return nil, err
	}
	out := make([]coreContainer, 0, len(list.Items))
	for _, c := range list.Items {
		name := ""
		if len(c.Names) > 0 {
			name = strings.TrimPrefix(c.Names[0], "/")
		}
		out = append(out, coreContainer{ID: c.ID, Name: name})
	}
	return out, nil
}

func namesOf(cs []coreContainer) []string {
	out := make([]string, len(cs))
	for i, c := range cs {
		out[i] = c.display()
	}
	return out
}

func isNewSoleOwner(sole string, baseline []string) bool {
	if sole == "" {
		return false
	}
	if len(baseline) == 0 {
		return true
	}
	for _, b := range baseline {
		if b == sole {
			return false
		}
	}
	return true
}

func waitForStableOwner(ctx context.Context, apiClient *client.Client, service string, baseline []string) error {
	msg.Line("core is mid-roll (Swarm update in progress); waiting for new task to become the sole owner...")
	wait := cliWaitTimeout()
	poll := cliPollInterval()
	deadline := time.Now().Add(wait)

	for time.Now().Before(deadline) {
		if err := ctx.Err(); err != nil {
			return err
		}
		state, stateMsg, err := coreUpdateState(ctx, apiClient, service)
		if err != nil {
			return err
		}
		if err := failBadUpdate(state, stateMsg); err != nil {
			return err
		}
		running, err := listRunningCore(ctx, apiClient, service)
		if err != nil {
			return err
		}
		n := len(running)
		sole := ""
		if n == 1 {
			sole = running[0].display()
		}
		if n == 1 {
			if state == string(swarm.UpdateStateCompleted) || state == "" || isNewSoleOwner(sole, baseline) {
				msg.Line("handoff complete; attaching to " + sole)
				return nil
			}
		} else if n == 0 && state != string(swarm.UpdateStateUpdating) {
			return fmt.Errorf("cli: no running %q containers", service)
		}

		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(poll):
		}
	}

	state, _, _ := coreUpdateState(ctx, apiClient, service)
	running, _ := listRunningCore(ctx, apiClient, service)
	return fmt.Errorf("cli: timed out after %s waiting for core handoff (state=%s, running=%d)",
		wait, orNone(state), len(running))
}

func orNone(s string) string {
	if s == "" {
		return "none"
	}
	return s
}

func runTasks(ctx context.Context, args []string) error {
	apiClient, err := docker.NewAPIClient(client.WithTimeout(cliWaitTimeout() + docker.DefaultClientTimeout))
	if err != nil {
		return fmt.Errorf("engine API client: %w", err)
	}
	defer apiClient.Close()

	ctr, err := resolveCoreContainer(ctx, apiClient)
	if err != nil {
		return err
	}
	msg.Line("core: " + ctr.display())

	cmd := args
	if len(cmd) == 0 || cmd[0] != "tasks" {
		cmd = append([]string{"tasks"}, args...)
	}
	return execOneShot(ctx, apiClient, ctr.ID, cmd)
}

func execOneShot(ctx context.Context, apiClient *client.Client, containerID string, cmd []string) error {
	create, err := apiClient.ExecCreate(ctx, containerID, client.ExecCreateOptions{
		AttachStdout: true,
		AttachStderr: true,
		Cmd:          cmd,
	})
	if err != nil {
		return fmt.Errorf("cli: exec create: %w", err)
	}
	attach, err := apiClient.ExecAttach(ctx, create.ID, client.ExecAttachOptions{})
	if err != nil {
		return fmt.Errorf("cli: exec attach: %w", err)
	}
	defer attach.Close()

	stdout, stderr := taskWriters()
	_, copyErr := stdcopy.StdCopy(stdout, stderr, attach.Reader)
	flushWriters(stdout, stderr)

	inspect, err := apiClient.ExecInspect(ctx, create.ID, client.ExecInspectOptions{})
	if err != nil {
		if copyErr != nil {
			return copyErr
		}
		return fmt.Errorf("cli: exec inspect: %w", err)
	}
	if inspect.ExitCode != 0 {
		return fmt.Errorf("cli: tasks exited %d", inspect.ExitCode)
	}
	return copyErr
}

func taskWriters() (stdout, stderr io.Writer) {
	if process.FromTUI() {
		lw := msg.NewLineWriter()
		return lw, lw
	}
	return os.Stdout, os.Stderr
}

func flushWriters(ws ...io.Writer) {
	for _, w := range ws {
		if f, ok := w.(*msg.LineWriter); ok {
			f.Flush()
		}
	}
}

func openShell(ctx context.Context) error {
	if process.FromTUI() {
		return fmt.Errorf("cli: interactive shell needs a terminal — type a tasks subcommand (e.g. list), or run eip cli outside the TUI")
	}
	if !process.Interactive() {
		return fmt.Errorf("cli: interactive shell requires a terminal; pass a tasks subcommand (e.g. eip cli list)")
	}

	apiClient, err := docker.NewAPIClient(client.WithTimeout(cliWaitTimeout() + docker.DefaultClientTimeout))
	if err != nil {
		return fmt.Errorf("engine API client: %w", err)
	}
	defer apiClient.Close()

	ctr, err := resolveCoreContainer(ctx, apiClient)
	if err != nil {
		return err
	}
	msg.Line("core: " + ctr.display())

	shell := strings.TrimSpace(os.Getenv("EIP_CLI_SHELL"))
	if shell == "" {
		shell, err = detectShell(ctx, apiClient, ctr.ID)
		if err != nil {
			return err
		}
	}
	msg.Line("interactive shell — for CLI jobs prefer: eip cli list (tasks is implied)")
	return execTTY(ctx, apiClient, ctr.ID, []string{shell})
}

func detectShell(ctx context.Context, apiClient *client.Client, containerID string) (string, error) {
	create, err := apiClient.ExecCreate(ctx, containerID, client.ExecCreateOptions{
		AttachStdout: true,
		AttachStderr: true,
		Cmd:          []string{"sh", "-c", "command -v bash >/dev/null 2>&1"},
	})
	if err != nil {
		return "sh", nil
	}
	attach, err := apiClient.ExecAttach(ctx, create.ID, client.ExecAttachOptions{})
	if err != nil {
		return "sh", nil
	}
	_, _ = io.Copy(io.Discard, attach.Reader)
	attach.Close()
	inspect, err := apiClient.ExecInspect(ctx, create.ID, client.ExecInspectOptions{})
	if err == nil && inspect.ExitCode == 0 {
		return "bash", nil
	}
	return "sh", nil
}

func execTTY(ctx context.Context, apiClient *client.Client, containerID string, cmd []string) error {
	inFD := int(os.Stdin.Fd())
	outFD := int(os.Stdout.Fd())
	width, height, err := term.GetSize(outFD)
	if err != nil || width <= 0 || height <= 0 {
		width, height = 80, 24
	}

	create, err := apiClient.ExecCreate(ctx, containerID, client.ExecCreateOptions{
		AttachStdin:  true,
		AttachStdout: true,
		AttachStderr: true,
		TTY:          true,
		ConsoleSize:  client.ConsoleSize{Height: uint(height), Width: uint(width)},
		Cmd:          cmd,
	})
	if err != nil {
		return fmt.Errorf("cli: exec create: %w", err)
	}

	oldState, err := term.MakeRaw(inFD)
	if err != nil {
		return fmt.Errorf("cli: terminal raw mode: %w", err)
	}
	defer func() { _ = term.Restore(inFD, oldState) }()

	attach, err := apiClient.ExecAttach(ctx, create.ID, client.ExecAttachOptions{
		TTY:         true,
		ConsoleSize: client.ConsoleSize{Height: uint(height), Width: uint(width)},
	})
	if err != nil {
		return fmt.Errorf("cli: exec attach: %w", err)
	}
	defer attach.Close()

	errCh := make(chan error, 1)
	go func() {
		_, copyErr := io.Copy(attach.Conn, os.Stdin)
		_ = attach.CloseWrite()
		errCh <- copyErr
	}()

	_, outErr := io.Copy(os.Stdout, attach.Reader)
	inErr := <-errCh
	if outErr != nil && ctx.Err() == nil {
		return outErr
	}
	if inErr != nil && ctx.Err() == nil && inErr != io.EOF {
		return inErr
	}

	inspect, err := apiClient.ExecInspect(ctx, create.ID, client.ExecInspectOptions{})
	if err != nil {
		return nil
	}
	if inspect.ExitCode != 0 {
		return fmt.Errorf("cli: shell exited %d", inspect.ExitCode)
	}
	return nil
}
