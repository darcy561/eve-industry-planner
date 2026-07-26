package docker

import (
	"context"
	"fmt"
	"io"

	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/client"
	"github.com/docker/docker/pkg/stdcopy"
)

// ServiceLogsOpts configures Swarm service log streaming.
type ServiceLogsOpts struct {
	Tail       string // e.g. "100"; empty → "100"
	Follow     bool
	Timestamps bool
}

// ServiceLogs opens the log stream for a Swarm service (caller must Close).
func ServiceLogs(ctx context.Context, cli client.APIClient, nameOrID string, opts ServiceLogsOpts) (io.ReadCloser, error) {
	if nameOrID == "" {
		return nil, fmt.Errorf("service logs: empty name")
	}
	tail := opts.Tail
	if tail == "" {
		tail = "100"
	}
	rc, err := cli.ServiceLogs(ctx, nameOrID, container.LogsOptions{
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
	return rc, nil
}

// CopyServiceLogs demuxes a ServiceLogs reader onto w (stdout+stderr frames → w).
func CopyServiceLogs(w io.Writer, rc io.Reader) error {
	_, err := stdcopy.StdCopy(w, w, rc)
	return err
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
