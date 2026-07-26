package exec

import (
	"bufio"
	"fmt"
	"io"
	"os"
	osexec "os/exec"
	"strings"
	"sync"
	"time"

	tea "github.com/charmbracelet/bubbletea"

	"eve-industry-planner/admintool/internal/kit"
	"eve-industry-planner/admintool/internal/msg"
	"eve-industry-planner/admintool/internal/process"
	"eve-industry-planner/admintool/internal/status"
	outstatus "eve-industry-planner/admintool/tui/output/status"
	"eve-industry-planner/admintool/tui/pane"
)

// ProbeKillAfter is how long a background probe child may run before Kill.
// Must exceed the Docker client timeout inside eip probe.
const ProbeKillAfter = 5 * time.Second

// EventMsg is a chip event from the child (decoded EIPMSG chip.*).
type EventMsg struct {
	Event msg.Event
}

// DoneMsg is sent when the child exits. Text is this run's pane chunks only
// (for Collect/Run); the home screen keeps scroll history in pane.Buffer.
type DoneMsg struct {
	Err   error
	Text  string
	Label string
}

// Stream is a running child. Msgs carries EventMsg, pane.AppendMsg, then DoneMsg.
type Stream struct {
	Msgs  chan tea.Msg
	label string
	cmd   *osexec.Cmd
}

// Kill forcefully stops the child (used when a probe hangs on a dead Docker engine).
func (s *Stream) Kill() {
	if s == nil || s.cmd == nil || s.cmd.Process == nil {
		return
	}
	_ = s.cmd.Process.Kill()
}

// WaitCmd waits for the next stream message.
func (s *Stream) WaitCmd() tea.Cmd {
	return func() tea.Msg {
		msg, ok := <-s.Msgs
		if !ok {
			return nil
		}
		return msg
	}
}

// Start launches child eip (EIP_FROM_TUI=1) and demuxes EIPMSG from stdout.
// Stderr lines are real errors → OUTPUT pane.
func Start(args []string, label string) (*Stream, error) {
	args = normalizeArgs(args)
	if len(args) == 0 {
		return nil, fmt.Errorf("no command given")
	}
	exe, err := os.Executable()
	if err != nil {
		return nil, fmt.Errorf("resolve eip binary: %w", err)
	}

	cmd := osexec.Command(exe, args...)
	cmd.Env = append(os.Environ(), process.ChildEnv())
	if home, err := kit.Home(); err == nil {
		cmd.Dir = home // kit paths resolve from project home (cwd)
	}
	cmd.Stdin = nil
	detachChild(cmd)

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, err
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return nil, err
	}
	if err := cmd.Start(); err != nil {
		return nil, err
	}

	s := &Stream{
		// Large enough for bursty Step/chip lines; sends block (no silent drop).
		Msgs:  make(chan tea.Msg, 256),
		label: label,
		cmd:   cmd,
	}

	var (
		mu   sync.Mutex
		text strings.Builder
		wg   sync.WaitGroup
	)
	appendPane := func(chunk string) {
		if chunk == "" {
			return
		}
		mu.Lock()
		if text.Len() > 0 {
			text.WriteByte('\n')
		}
		text.WriteString(chunk)
		mu.Unlock()
		s.Msgs <- pane.AppendMsg{Text: chunk}
	}

	dispatchEIPMSG := func(line string) {
		env, ok := msg.ParseLine(line)
		if !ok {
			return // non-protocol stdout discarded
		}
		if ev, ok := msg.EventFromEnvelope(env); ok {
			s.Msgs <- EventMsg{Event: ev}
			return
		}
		switch env.Type {
		case msg.TypePaneText:
			msg, err := msg.DecodeText(env.Data)
			if err != nil || msg == "" {
				return
			}
			appendPane(msg)
		case msg.TypePaneStatus:
			var report status.Report
			if err := msg.DecodeData(env, &report); err != nil {
				return
			}
			s.Msgs <- outstatus.Msg{Report: report}
		}
	}

	wg.Add(2)
	go func() {
		defer wg.Done()
		scanLines(stdout, dispatchEIPMSG)
	}()
	go func() {
		defer wg.Done()
		scanLines(stderr, appendPane)
	}()

	go func() {
		waitErr := cmd.Wait()
		wg.Wait()
		mu.Lock()
		final := strings.TrimSpace(text.String())
		mu.Unlock()
		s.Msgs <- DoneMsg{Err: waitErr, Text: final, Label: label}
		close(s.Msgs)
	}()

	return s, nil
}

// Collect runs a child to completion (used by ProbeCmd). Returns pane text + chip events.
func Collect(args []string) (text string, events []msg.Event, err error) {
	return collect(args, 0)
}

// CollectProbe runs a background probe with a hard Kill deadline so a stopped
// Docker engine cannot stall the TUI poller forever.
func CollectProbe(args []string) (text string, events []msg.Event, err error) {
	return collect(args, ProbeKillAfter)
}

func collect(args []string, killAfter time.Duration) (text string, events []msg.Event, err error) {
	s, err := Start(args, "")
	if err != nil {
		return "", nil, err
	}
	if killAfter > 0 {
		timer := time.AfterFunc(killAfter, s.Kill)
		defer timer.Stop()
	}
	for msg := range s.Msgs {
		switch m := msg.(type) {
		case EventMsg:
			events = append(events, m.Event)
		case DoneMsg:
			text = m.Text
			if text == "" && m.Err != nil {
				text = m.Err.Error()
			}
			return text, events, m.Err
		}
	}
	return text, events, err
}

// CollectRawStdout runs a child and returns combined stdout (not EIPMSG-demuxed).
// Used for machine-readable helpers like `eip restart --list`.
func CollectRawStdout(args []string) (string, error) {
	args = normalizeArgs(args)
	if len(args) == 0 {
		return "", fmt.Errorf("no command given")
	}
	exe, err := os.Executable()
	if err != nil {
		return "", fmt.Errorf("resolve eip binary: %w", err)
	}
	cmd := osexec.Command(exe, args...)
	cmd.Env = append(os.Environ(), process.ChildEnv())
	if home, err := kit.Home(); err == nil {
		cmd.Dir = home
	}
	cmd.Stdin = nil
	detachChild(cmd)
	out, err := cmd.Output()
	return string(out), err
}

// Run is a blocking convenience for callers that only need pane text.
func Run(args []string) string {
	text, _, err := Collect(args)
	text = strings.TrimSpace(text)
	if err != nil {
		if text == "" {
			return err.Error()
		}
		return text + "\n" + err.Error()
	}
	if text == "" {
		return "(no output)"
	}
	return text
}

func scanLines(r io.Reader, fn func(string)) {
	sc := bufio.NewScanner(r)
	buf := make([]byte, 0, 64*1024)
	sc.Buffer(buf, 1024*1024)
	for sc.Scan() {
		fn(sc.Text())
	}
}
