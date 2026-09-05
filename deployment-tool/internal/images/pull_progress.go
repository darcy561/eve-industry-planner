package images

import (
	"fmt"
	"io"
	"os"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/docker/go-units"
	"github.com/moby/moby/api/types/jsonstream"
	"golang.org/x/term"

	"eve-industry-planner/deployment-tool/internal/msg"
)

var osStdout io.Writer = os.Stdout

func isStdoutTTY() bool {
	f, ok := osStdout.(*os.File)
	if !ok {
		return false
	}
	return term.IsTerminal(int(f.Fd()))
}

const (
	pullBarWidth     = 22
	pullEmitInterval = 120 * time.Millisecond
	pullLabelWidth   = 36
)

type pullLayer struct {
	current int64
	total   int64
	done    bool
}

type pullRow struct {
	ref      string
	label    string
	status   string
	err      string
	layers   map[string]*pullLayer
	current  int64
	total    int64
	upToDate bool
}

type pullBoard struct {
	mu       sync.Mutex
	order    []string
	rows     map[string]*pullRow
	parallel int
	lastEmit time.Time
	cliTTY   bool
	ttyLines int
}

func newPullBoard(refs []string, parallel int) *pullBoard {
	b := &pullBoard{
		order:    append([]string(nil), refs...),
		rows:     make(map[string]*pullRow, len(refs)),
		parallel: parallel,
		cliTTY:   !msg.Enabled() && isStdoutTTY(),
	}
	for _, ref := range refs {
		b.rows[ref] = &pullRow{
			ref:    ref,
			label:  shortImageLabel(ref, pullLabelWidth),
			status: "waiting",
			layers: map[string]*pullLayer{},
		}
	}
	return b
}

func (b *pullBoard) setStatus(ref, status string) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if r := b.rows[ref]; r != nil {
		r.status = status
	}
	b.emitLocked(false)
}

func (b *pullBoard) setError(ref string, err error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if r := b.rows[ref]; r != nil {
		r.status = "error"
		if err != nil {
			r.err = err.Error()
		}
	}
	b.emitLocked(true)
}

func (b *pullBoard) setDone(ref string, upToDate bool, size int64) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if r := b.rows[ref]; r != nil {
		r.status = "done"
		r.upToDate = upToDate
		if size > 0 {
			r.total = size
			r.current = size
		}
	}
	b.emitLocked(true)
}

func (b *pullBoard) onJSON(ref string, jm jsonstream.Message) {
	b.mu.Lock()
	defer b.mu.Unlock()
	r := b.rows[ref]
	if r == nil || r.status == "done" || r.status == "error" {
		return
	}
	r.status = "pulling"
	if jm.Error != nil {
		r.status = "error"
		r.err = jm.Error.Message
		b.emitLocked(true)
		return
	}
	id := jm.ID
	if id != "" {
		layer := r.layers[id]
		if layer == nil {
			layer = &pullLayer{}
			r.layers[id] = layer
		}
		if jm.Progress != nil {
			layer.current = jm.Progress.Current
			layer.total = jm.Progress.Total
		}
		st := strings.ToLower(jm.Status)
		if strings.Contains(st, "already exists") || strings.Contains(st, "pull complete") {
			layer.done = true
			if layer.total > 0 {
				layer.current = layer.total
			}
		}
	}
	if strings.Contains(strings.ToLower(jm.Status), "up to date") {
		r.upToDate = true
	}
	var cur, tot int64
	for _, layer := range r.layers {
		cur += layer.current
		if layer.total > 0 {
			tot += layer.total
		} else if layer.done && layer.current > 0 {
			tot += layer.current
		}
	}
	r.current, r.total = cur, tot
	b.emitLocked(false)
}

func (b *pullBoard) emit(force bool) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.emitLocked(force)
}

func (b *pullBoard) finish() {
	b.mu.Lock()
	defer b.mu.Unlock()
	text := b.renderLocked()
	if msg.Enabled() {
		msg.EmitProgressFrac(text, true, b.fractionLocked())
	} else if b.cliTTY {
		b.writeTTY(text)
		fmt.Fprint(osStdout, "\n")
	} else {
		msg.Line(text)
	}
}

func (b *pullBoard) emitLocked(force bool) {
	now := time.Now()
	if !force && !b.lastEmit.IsZero() && now.Sub(b.lastEmit) < pullEmitInterval {
		return
	}
	b.lastEmit = now
	text := b.renderLocked()
	if msg.Enabled() {
		msg.EmitProgressFrac(text, false, b.fractionLocked())
		return
	}
	if b.cliTTY {
		b.writeTTY(text)
	}
}

// fractionLocked is overall pull progress in [0,1]: each image contributes
// equally; pulling images use byte ratio when total is known.
func (b *pullBoard) fractionLocked() float64 {
	n := len(b.order)
	if n == 0 {
		return 0
	}
	var sum float64
	for _, ref := range b.order {
		r := b.rows[ref]
		if r == nil {
			continue
		}
		switch r.status {
		case "done", "error":
			sum += 1
		case "pulling":
			if r.total > 0 {
				sum += float64(r.current) / float64(r.total)
			}
		}
	}
	return msg.ClampFraction(sum / float64(n))
}

func (b *pullBoard) renderLocked() string {
	var sb strings.Builder
	fmt.Fprintf(&sb, "Pulling %d images (%d parallel)\n", len(b.order), b.parallel)
	for _, ref := range b.order {
		r := b.rows[ref]
		if r == nil {
			continue
		}
		sb.WriteString("  ")
		sb.WriteString(padRight(r.label, pullLabelWidth))
		sb.WriteString(" ")
		switch r.status {
		case "waiting":
			sb.WriteString(renderBar(0, 1))
			sb.WriteString("  waiting")
		case "pulling":
			sb.WriteString(renderBar(r.current, r.total))
			sb.WriteString("  ")
			sb.WriteString(formatBytesPair(r.current, r.total))
		case "done":
			sb.WriteString(renderBar(1, 1))
			sb.WriteString("  ")
			if r.total > 0 {
				sb.WriteString(units.HumanSize(float64(r.total)))
				sb.WriteString("  ")
			}
			if r.upToDate {
				sb.WriteString("up to date")
			} else {
				sb.WriteString("pulled")
			}
		case "error":
			sb.WriteString(renderBar(0, 1))
			sb.WriteString("  ERROR")
			if r.err != "" {
				sb.WriteString("  ")
				sb.WriteString(truncateRunes(r.err, 48))
			}
		}
		sb.WriteByte('\n')
	}
	return strings.TrimRight(sb.String(), "\n")
}

func (b *pullBoard) writeTTY(text string) {
	if b.ttyLines > 0 {
		fmt.Fprintf(osStdout, "\033[%dA", b.ttyLines)
	}
	lines := strings.Split(text, "\n")
	for i, line := range lines {
		fmt.Fprint(osStdout, "\033[2K\r")
		fmt.Fprint(osStdout, line)
		if i < len(lines)-1 {
			fmt.Fprint(osStdout, "\n")
		} else {
			fmt.Fprint(osStdout, "\n")
		}
	}
	for i := len(lines); i < b.ttyLines; i++ {
		fmt.Fprint(osStdout, "\033[2K\r\n")
	}
	if len(lines) < b.ttyLines {
		fmt.Fprintf(osStdout, "\033[%dA", b.ttyLines-len(lines))
	}
	b.ttyLines = len(lines)
}

func renderBar(current, total int64) string {
	if total <= 0 {
		return "[" + strings.Repeat("·", pullBarWidth) + "]"
	}
	pct := float64(current) / float64(total)
	if pct < 0 {
		pct = 0
	}
	if pct > 1 {
		pct = 1
	}
	filled := min(int(pct*float64(pullBarWidth)), pullBarWidth)
	return "[" + strings.Repeat("█", filled) + strings.Repeat("░", pullBarWidth-filled) + "]"
}

func formatBytesPair(current, total int64) string {
	if total <= 0 {
		if current <= 0 {
			return "…"
		}
		return units.HumanSize(float64(current))
	}
	return units.HumanSize(float64(current)) + " / " + units.HumanSize(float64(total))
}

func shortImageLabel(ref string, max int) string {
	ref = strings.TrimSpace(ref)
	if utf8.RuneCountInString(ref) <= max {
		return ref
	}
	if _, base, ok := strings.CutLast(ref, "/"); ok && base != "" {
		ref = base
	}
	return truncateRunes(ref, max)
}

func padRight(s string, width int) string {
	n := utf8.RuneCountInString(s)
	if n >= width {
		return truncateRunes(s, width)
	}
	return s + strings.Repeat(" ", width-n)
}

func truncateRunes(s string, max int) string {
	if max <= 0 {
		return ""
	}
	if utf8.RuneCountInString(s) <= max {
		return s
	}
	runes := []rune(s)
	if max == 1 {
		return "…"
	}
	return string(runes[:max-1]) + "…"
}
