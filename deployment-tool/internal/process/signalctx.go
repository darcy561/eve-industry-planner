package process

import (
	"context"
	"errors"
	"os"
	"os/signal"
	"time"
)

// ErrInterrupted is returned when a command stops because the operator sent
// interrupt (Ctrl+C / TUI cancel), as opposed to a hard failure or timeout.
var ErrInterrupted = errors.New("interrupted")

// SignalContext cancels on os.Interrupt only (no deadline). Use for long
// ensure paths that already wait indefinitely for Docker work.
func SignalContext() (context.Context, context.CancelFunc) {
	return signal.NotifyContext(context.Background(), os.Interrupt)
}

// TimeoutSignalContext returns a context that cancels on os.Interrupt or after
// timeout (whichever first). Caller must defer the cancel func.
func TimeoutSignalContext(timeout time.Duration) (context.Context, context.CancelFunc) {
	sigCtx, stop := SignalContext()
	ctx, cancel := context.WithTimeout(sigCtx, timeout)
	return ctx, func() {
		cancel()
		stop()
	}
}

// MapDoneError rewrites context cancel/deadline errors for operator-facing CLI
// exits. Interrupt (signal or parent cancel) → ErrInterrupted; deadlines kept.
func MapDoneError(err error) error {
	if err == nil {
		return nil
	}
	if errors.Is(err, context.DeadlineExceeded) {
		return err
	}
	if errors.Is(err, context.Canceled) || errors.Is(err, ErrInterrupted) {
		return ErrInterrupted
	}
	return err
}
