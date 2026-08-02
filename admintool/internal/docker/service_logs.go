package docker

import (
	"context"
	"fmt"
	"io"

	"github.com/moby/moby/api/pkg/stdcopy"
	"github.com/moby/moby/client"
)

// ServiceLogsOpts configures Swarm service log streaming.
type ServiceLogsOpts struct {
	Tail       string // e.g. "100"; empty → "100"
	Follow     bool
	Timestamps bool
}

// ServiceLogs opens the log stream for a Swarm service (caller must Close).
func ServiceLogs(ctx context.Context, apiClient *client.Client, nameOrID string, opts ServiceLogsOpts) (io.ReadCloser, error) {
	if nameOrID == "" {
		return nil, fmt.Errorf("service logs: empty name")
	}
	tail := opts.Tail
	if tail == "" {
		tail = "100"
	}
	result, err := apiClient.ServiceLogs(ctx, nameOrID, client.ServiceLogsOptions{
		ShowStdout: true,
		ShowStderr: true,
		Follow:     opts.Follow,
		Tail:       tail,
		Timestamps: opts.Timestamps,
		Details:    true,
	})
	if err != nil {
		return nil, fmt.Errorf("service logs %s: %w", nameOrID, err)
	}
	return result, nil
}

// CopyServiceLogsFormatted demuxes and rewrites Swarm details prefixes into
// short "service.task | message" lines (readable in TUI / consoles).
func CopyServiceLogsFormatted(w io.Writer, rc io.Reader, serviceShort string) error {
	fw := &LogFormatWriter{W: w, Service: serviceShort}
	_, err := stdcopy.StdCopy(fw, fw, rc)
	if flushErr := fw.Flush(); err == nil {
		err = flushErr
	}
	return err
}
