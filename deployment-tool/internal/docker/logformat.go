package docker

import (
	"bytes"
	"fmt"
	"io"
	"regexp"
	"strings"
)

// swarmDetailsLine: label block then message (Engine service logs with Details).
var (
	swarmDetailsLine = regexp.MustCompile(`^((?:com\.docker\.swarm\.[^=]+=[^,\s]+)(?:,com\.docker\.swarm\.[^=]+=[^,\s]+)*)\s+(.*)$`)
	swarmTaskID      = regexp.MustCompile(`com\.docker\.swarm\.task\.id=([A-Za-z0-9]+)`)
)

// FormatServiceLogLine turns a details-prefixed Swarm log line into a short
// docker-CLI-like prefix: "api.ujyacemehw51 | message".
func FormatServiceLogLine(serviceShort, line string) string {
	line = strings.TrimRight(line, "\r\n")
	if line == "" {
		return ""
	}
	msg := line
	task := ""
	if m := swarmDetailsLine.FindStringSubmatch(line); len(m) == 3 {
		if t := swarmTaskID.FindStringSubmatch(m[1]); len(t) == 2 {
			task = shortID(t[1])
		}
		msg = m[2]
	} else if !strings.Contains(line, "com.docker.swarm.") {
		return line
	}
	svc := strings.TrimSpace(serviceShort)
	if svc == "" {
		return msg
	}
	if task != "" {
		return fmt.Sprintf("%s.%s | %s", svc, task, msg)
	}
	return fmt.Sprintf("%s | %s", svc, msg)
}

// LogFormatWriter demux-formats service log bytes as readable lines onto W.
// Pointer receiver required — StdCopy writes partial chunks.
type LogFormatWriter struct {
	W       io.Writer
	Service string
	buf     bytes.Buffer
}

func (l *LogFormatWriter) Write(p []byte) (int, error) {
	if l == nil {
		return 0, fmt.Errorf("nil LogFormatWriter")
	}
	n, _ := l.buf.Write(p)
	for {
		data := l.buf.Bytes()
		i := bytes.IndexByte(data, '\n')
		if i < 0 {
			break
		}
		line := string(data[:i])
		l.buf.Next(i + 1)
		out := FormatServiceLogLine(l.Service, line)
		if out == "" {
			continue
		}
		if _, err := fmt.Fprintln(l.W, out); err != nil {
			return n, err
		}
	}
	return n, nil
}

// Flush writes any trailing partial line (no final newline from stream).
func (l *LogFormatWriter) Flush() error {
	if l == nil || l.buf.Len() == 0 {
		return nil
	}
	out := FormatServiceLogLine(l.Service, l.buf.String())
	l.buf.Reset()
	if out == "" {
		return nil
	}
	_, err := fmt.Fprintln(l.W, out)
	return err
}
