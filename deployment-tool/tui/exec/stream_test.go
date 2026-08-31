package exec

import (
	"encoding/json"
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"

	"eve-industry-planner/deployment-tool/internal/msg"
	"eve-industry-planner/deployment-tool/internal/status"
	outstatus "eve-industry-planner/deployment-tool/tui/output/status"
	"eve-industry-planner/deployment-tool/tui/pane"
)

func eipLine(t *testing.T, typ string, data any) string {
	t.Helper()
	raw, err := json.Marshal(data)
	if err != nil {
		t.Fatal(err)
	}
	b, err := json.Marshal(msg.Envelope{Version: msg.Version, Type: typ, Data: raw})
	if err != nil {
		t.Fatal(err)
	}
	return msg.Prefix + string(b)
}

func TestRouteStdoutLineDemux(t *testing.T) {
	t.Parallel()
	var got []tea.Msg
	var panes []string
	send := func(m tea.Msg) { got = append(got, m) }
	appendPane := func(s string) { panes = append(panes, s) }

	routeStdoutLine("not protocol", send, appendPane)
	routeStdoutLine(eipLine(t, msg.TypePaneText, msg.TextPayload{Message: "hello"}), send, appendPane)
	routeStdoutLine(eipLine(t, msg.KindDocker, msg.Event{State: "active", Light: msg.LightGreen}), send, appendPane)
	f := 0.5
	routeStdoutLine(eipLine(t, msg.TypePaneProgress, msg.ProgressPayload{Text: "pull", Fraction: &f}), send, appendPane)
	routeStdoutLine(eipLine(t, msg.TypePaneStatus, status.Report{StackName: "eip", Overall: status.OK}), send, appendPane)

	if len(panes) != 1 || panes[0] != "hello" {
		t.Fatalf("panes=%v", panes)
	}
	if len(got) != 3 {
		t.Fatalf("msgs=%d %#v", len(got), got)
	}
	ev, ok := got[0].(EventMsg)
	if !ok || ev.Event.Kind != msg.KindDocker || ev.Event.Light != msg.LightGreen {
		t.Fatalf("chip: %#v", got[0])
	}
	prog, ok := got[1].(pane.ProgressMsg)
	if !ok || prog.Text != "pull" || prog.Fraction == nil || *prog.Fraction != 0.5 {
		t.Fatalf("progress: %#v", got[1])
	}
	st, ok := got[2].(outstatus.Msg)
	if !ok || st.Report.StackName != "eip" {
		t.Fatalf("status: %#v", got[2])
	}
}

func TestScanLines(t *testing.T) {
	t.Parallel()
	var lines []string
	scanLines(strings.NewReader("a\nb\nc"), func(s string) { lines = append(lines, s) })
	if strings.Join(lines, ",") != "a,b,c" {
		t.Fatalf("got %v", lines)
	}
}

func TestWaitCmdAndConsume(t *testing.T) {
	t.Parallel()
	s := &Stream{Msgs: make(chan tea.Msg, 2), label: "probe"}
	s.Msgs <- EventMsg{Event: msg.Event{Kind: msg.KindHealth, Light: msg.LightAmber}}
	close(s.Msgs)
	msg1 := s.WaitCmd()()
	if _, ok := msg1.(EventMsg); !ok {
		t.Fatalf("got %T", msg1)
	}
	if s.WaitCmd()() != nil {
		t.Fatal("closed channel → nil")
	}

	s2 := &Stream{Msgs: make(chan tea.Msg, 4)}
	s2.Msgs <- EventMsg{Event: msg.Event{Kind: msg.KindApp, Message: "1.0"}}
	s2.Msgs <- DoneMsg{Text: "board", Err: nil}
	close(s2.Msgs)
	text, events, err := consumeStream(s2)
	if err != nil || text != "board" || len(events) != 1 || events[0].Message != "1.0" {
		t.Fatalf("text=%q events=%v err=%v", text, events, err)
	}
}

func TestConsumeDoneErrorText(t *testing.T) {
	t.Parallel()
	s := &Stream{Msgs: make(chan tea.Msg, 1)}
	s.Msgs <- DoneMsg{Err: errString("boom")}
	close(s.Msgs)
	text, _, err := consumeStream(s)
	if err == nil || text != "boom" {
		t.Fatalf("text=%q err=%v", text, err)
	}
}

type errString string

func (e errString) Error() string { return string(e) }

func TestNilStreamControls(t *testing.T) {
	t.Parallel()
	var s *Stream
	s.Kill()
	s.Interrupt()
	s.Cancel()
	(&Stream{}).Kill()
	(&Stream{}).Interrupt()
}

func TestStartRejectsEmptyArgs(t *testing.T) {
	t.Parallel()
	if _, err := Start(nil, "x"); err == nil {
		t.Fatal("want error")
	}
	if _, _, err := Collect(nil); err == nil {
		t.Fatal("Collect empty")
	}
	if _, err := CollectRawStdout(nil); err == nil {
		t.Fatal("CollectRawStdout empty")
	}
}
