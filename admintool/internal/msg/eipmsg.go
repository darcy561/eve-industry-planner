// Package msg is the JSONL wire protocol from child eip → TUI parent (EIPMSG)
// plus chip.* emit helpers for the status bar.
//
// When process.FromTUI(), Emit writes one line to stdout:
//
//	EIPMSG {"version":1,"type":"pane.status","data":{…}}
//
// Stderr is reserved for human error text (TUI appends it to the OUTPUT pane).
// Standalone CLI leaves EIP_FROM_TUI unset — Emit is a no-op; verbs print on stdout.
package msg

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"strings"

	"eve-industry-planner/admintool/internal/process"
)

// Prefix begins each protocol line on stdout.
const Prefix = "EIPMSG "

// Version is the envelope version written by this binary.
const Version = 1

// Message types (stable strings). Chip helpers live in chipstate; pane helpers here.
const (
	TypePaneText   = "pane.text"
	TypePaneStatus = "pane.status"
	TypeChipDocker = "chip.docker"
	TypeChipHealth = "chip.health"
	TypeChipStack  = "chip.stack"
	TypeChipApp    = "chip.app" // deployed APP_VERSION (header; probe may emit)
)

// Envelope is one protocol message.
type Envelope struct {
	Version int             `json:"version"`
	Type    string          `json:"type"`
	Data    json.RawMessage `json:"data"`
}

// TextPayload is data for TypePaneText.
type TextPayload struct {
	Message string `json:"message"`
}

// Enabled reports whether the process should emit EIPMSG (child of TUI).
func Enabled() bool {
	return process.FromTUI()
}

// emit marshals data and writes one EIPMSG line to stdout when Enabled.
func emit(typ string, data any) {
	if !Enabled() || typ == "" {
		return
	}
	var raw json.RawMessage
	if data == nil {
		raw = json.RawMessage("{}")
	} else {
		b, err := json.Marshal(data)
		if err != nil {
			return
		}
		raw = b
	}
	b, err := json.Marshal(Envelope{Version: Version, Type: typ, Data: raw})
	if err != nil {
		return
	}
	fmt.Fprintln(os.Stdout, Prefix+string(b))
}

// EmitText emits TypePaneText.
func EmitText(message string) {
	if message == "" {
		return
	}
	emit(TypePaneText, TextPayload{Message: message})
}

// Emitf emits TypePaneText with sprintf.
func Emitf(format string, args ...any) {
	EmitText(fmt.Sprintf(format, args...))
}

// Step prints a progress line: EIPMSG pane.text under TUI, else plain stdout.
func Step(format string, args ...any) {
	Line(fmt.Sprintf(format, args...))
}

// Line prints one progress/output line (TUI pane.text or CLI stdout).
// Prefer Line over Step when the text may contain "%" (no sprintf).
func Line(msg string) {
	if msg == "" {
		return
	}
	if Enabled() {
		EmitText(msg)
		return
	}
	fmt.Fprintln(os.Stdout, msg)
}

// LineWriter turns Write() byte streams into Line() calls (newline-delimited).
// Call Flush after the producer finishes so a trailing line without '\n' is emitted.
func NewLineWriter() *LineWriter {
	return &LineWriter{}
}

// LineWriter is an io.Writer that relays complete lines via Line.
type LineWriter struct {
	buf []byte
}

func (w *LineWriter) Write(p []byte) (int, error) {
	if w == nil {
		return len(p), nil
	}
	w.buf = append(w.buf, p...)
	for {
		i := bytes.IndexByte(w.buf, '\n')
		if i < 0 {
			break
		}
		line := string(bytes.TrimRight(w.buf[:i], "\r"))
		w.buf = w.buf[i+1:]
		if line != "" {
			Line(line)
		}
	}
	return len(p), nil
}

// Flush emits any buffered partial line.
func (w *LineWriter) Flush() {
	if w == nil || len(w.buf) == 0 {
		return
	}
	line := string(bytes.TrimRight(w.buf, "\r"))
	w.buf = nil
	if line != "" {
		Line(line)
	}
}

// Ensure LineWriter implements io.Writer.
var _ io.Writer = (*LineWriter)(nil)

// EmitStatus emits TypePaneStatus (structured OUTPUT; TUI renders).
func EmitStatus(report any) {
	emit(TypePaneStatus, report)
}

// ParseLine parses one stdout line. ok is false if it is not EIPMSG or unsupported.
func ParseLine(line string) (Envelope, bool) {
	line = strings.TrimSpace(line)
	if !strings.HasPrefix(line, Prefix) {
		return Envelope{}, false
	}
	payload := strings.TrimSpace(strings.TrimPrefix(line, Prefix))
	var env Envelope
	if err := json.Unmarshal([]byte(payload), &env); err != nil {
		return Envelope{}, false
	}
	if env.Type == "" || env.Version != Version {
		return Envelope{}, false
	}
	return env, true
}

// DecodeData unmarshals env.Data into dest.
func DecodeData(env Envelope, dest any) error {
	if len(env.Data) == 0 {
		return fmt.Errorf("eipmsg: empty data for type %s", env.Type)
	}
	return json.Unmarshal(env.Data, dest)
}

// DecodeText unmarshals pane.text data.
func DecodeText(data json.RawMessage) (string, error) {
	var p TextPayload
	if err := json.Unmarshal(data, &p); err != nil {
		return "", err
	}
	return p.Message, nil
}

// IsChip reports whether typ is a chip.* message.
func IsChip(typ string) bool {
	switch typ {
	case TypeChipDocker, TypeChipHealth, TypeChipStack, TypeChipApp:
		return true
	default:
		return false
	}
}
