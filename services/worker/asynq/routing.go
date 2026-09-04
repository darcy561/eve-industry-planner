package asynq

import (
	"context"
	"encoding/json"
	"fmt"
	"slices"
	"time"

	eipnats "eve-industry-planner/shared/nats"
	"eve-industry-planner/worker/taskrun"

	"github.com/hibiken/asynq"
)

const (
	minTaskTimeout = 10 * time.Second
	maxTaskTimeout = 2 * time.Hour
)

// taskTimeoutFor returns the asynq handler deadline a task runs under, clamped.
//
// There is no default to fall back on: a task the registry does not know is
// refused before it reaches here, rather than run on a guessed deadline.
func taskTimeoutFor(task eipnats.Definition) time.Duration {
	return clampTaskTimeout(task.DefaultTimeout)
}

// clampTaskTimeout enforces sane bounds for asynq.Timeout.
func clampTaskTimeout(d time.Duration) time.Duration {
	switch {
	case d < minTaskTimeout:
		return minTaskTimeout
	case d > maxTaskTimeout:
		return maxTaskTimeout
	default:
		return d
	}
}

// handle registers a task's handler under the name in its definition. The asynq
// mux keys on a bare string; this and [handleTrigger] are the only places that
// string is written.
//
// The request is decoded here rather than by the handler, so the type a
// publisher sends and the type a handler takes are held together by the
// compiler.
func handle[T any](
	into map[string]asynq.HandlerFunc,
	task eipnats.Definition,
	deps *taskrun.Dependencies,
	fn func(context.Context, T, *taskrun.Dependencies) error,
) {
	into[task.Name] = asynq.HandlerFunc(func(ctx context.Context, t *asynq.Task) error {
		req, err := decodeRequest[T](t)
		if err != nil {
			return fmt.Errorf("%s: %w", task.Name, err)
		}
		return fn(ctx, req, deps)
	})
}

// handleTrigger registers a task that carries no request. The queue name is the
// whole instruction, so there is nothing to decode and nothing to validate.
func handleTrigger(
	into map[string]asynq.HandlerFunc,
	task eipnats.Definition,
	deps *taskrun.Dependencies,
	fn func(context.Context, *taskrun.Dependencies) error,
) {
	into[task.Name] = asynq.HandlerFunc(func(ctx context.Context, _ *asynq.Task) error {
		return fn(ctx, deps)
	})
}

// mount puts the registered handlers on the mux, checked against the registry.
//
// The registry is what decides the set: every definition must have a handler and
// every handler must serve a definition. A task with nothing to run it is
// accepted by asynq and then discarded, and a handler for a name no task carries
// is never reached — neither says anything at the time, so both are refused here,
// at boot, rather than being discovered when the work does not happen.
func mount(mux *asynq.ServeMux, handlers map[string]asynq.HandlerFunc) error {
	var missing []string
	for _, task := range eipnats.Tasks() {
		fn, ok := handlers[task.Name]
		if !ok {
			missing = append(missing, task.Name)
			continue
		}
		mux.Handle(task.Name, fn)
	}
	var unclaimed []string
	for name := range handlers {
		if _, ok := eipnats.LookupTask(name); !ok {
			unclaimed = append(unclaimed, name)
		}
	}
	slices.Sort(missing)
	slices.Sort(unclaimed)
	switch {
	case len(missing) > 0 && len(unclaimed) > 0:
		return fmt.Errorf("tasks with no handler: %v; handlers for no task: %v", missing, unclaimed)
	case len(missing) > 0:
		return fmt.Errorf("tasks with no handler: %v", missing)
	case len(unclaimed) > 0:
		return fmt.Errorf("handlers for no task: %v", unclaimed)
	}
	return nil
}

// decodeRequest reads the request a publisher sent.
//
// An absent request is refused rather than decoded: JSON null unmarshals into
// any struct without complaint, so a task would otherwise run on a zero-valued
// request and fail somewhere further in, reporting the wrong thing. Both
// refusals are terminal — a payload that will not parse now will not parse on a
// retry either.
func decodeRequest[T any](t *asynq.Task) (T, error) {
	var req T
	payload := t.Payload()
	if len(payload) == 0 || string(payload) == "null" {
		return req, eipnats.Terminate("carries no request")
	}
	if err := json.Unmarshal(payload, &req); err != nil {
		return req, eipnats.Terminate("request will not decode: %v", err)
	}
	return req, nil
}

// terminalAsSkipRetry tells the queue what a terminal error already means.
//
// A task says "this cannot succeed" with [eipnats.Terminate], the same way the
// consumer that carried it says so, and one word is worth more than a task
// author having to know which half of the machine they are writing for. Asynq
// recognises only its own sentinel, so the translation happens once, here.
func terminalAsSkipRetry(err error) error {
	if err == nil || !eipnats.IsTerminal(err) {
		return err
	}
	return fmt.Errorf("%w: %w", err, asynq.SkipRetry)
}
