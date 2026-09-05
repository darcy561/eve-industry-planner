package taskrun

import (
	"context"

	"github.com/hibiken/asynq"
)

// Run is what the engine knows about the attempt in progress.
//
// The deadline is deliberately absent: asynq sets it on the context, so
// ctx.Deadline() is already the one place to ask.
type Run struct {
	// ID is the queue's identifier for this task, the one an operator sees.
	ID         string
	Queue      string
	Retried    int
	MaxRetries int
}

// FinalAttempt reports whether the queue will archive this task if it fails
// again. It is the last attempt when the retries used have reached the limit,
// not passed it.
func (r Run) FinalAttempt() bool { return r.Retried >= r.MaxRetries }

// Current reports the run in progress, and whether there is one.
//
// Outside a running task nothing is known, which a caller must tell apart from a
// run with no attempts left: reading an absent budget as spent would stop work
// that had not been tried.
func Current(ctx context.Context) (Run, bool) {
	retried, hasRetried := asynq.GetRetryCount(ctx)
	maxRetry, hasMax := asynq.GetMaxRetry(ctx)
	if !hasRetried || !hasMax {
		return Run{}, false
	}
	id, _ := asynq.GetTaskID(ctx)
	queue, _ := asynq.GetQueueName(ctx)
	return Run{ID: id, Queue: queue, Retried: retried, MaxRetries: maxRetry}, true
}
