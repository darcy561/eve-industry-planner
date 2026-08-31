package nats

import (
	"context"
	"time"
)

// Definition is what a task is: the handler key, the subject it travels on, and
// the queue and deadline the worker gives it. The worker resolves the last two
// by name at runtime, which is why definitions are values rather than only the
// publish helpers below.
type Definition struct {
	Name            string
	Subject         string
	DefaultPriority string
	DefaultTimeout  time.Duration
}

var taskRegistry = map[string]Definition{}

// defineTask registers a task and returns it.
func defineTask(d Definition) Definition {
	if d.Name == "" || d.Subject == "" {
		panic("nats: task name and subject are required")
	}
	if _, exists := taskRegistry[d.Name]; exists {
		panic("nats: duplicate task name " + d.Name)
	}
	taskRegistry[d.Name] = d
	return d
}

// LookupTask returns the definition registered under name.
func LookupTask(name string) (Definition, bool) {
	d, ok := taskRegistry[name]
	return d, ok
}

// Tasks returns every registered definition, for callers that must cover the set.
func Tasks() []Definition {
	out := make([]Definition, 0, len(taskRegistry))
	for _, d := range taskRegistry {
		out = append(out, d)
	}
	return out
}

// publish sends a payload on a task's subject. The queue it runs on is the
// task's own, recorded in its definition and resolved by the worker.
func publish(ctx context.Context, n *NATS, d Definition, payload any) error {
	return n.PublishTask(ctx, d.Subject, d.Name, payload)
}

// trigger fires a task that carries no payload.
func trigger(ctx context.Context, n *NATS, d Definition) error {
	return n.PublishEmpty(ctx, d.Subject)
}
