package main

import (
	"testing"

	eipnats "eve-industry-planner/shared/nats"

	"github.com/nats-io/nats.go/jetstream"
)

// stubMsg is a delivered message. Resolving a subject reads nothing else, so the
// rest of the interface is left to panic if that changes.
type stubMsg struct {
	jetstream.Msg
	subject string
}

func (m stubMsg) Subject() string { return m.subject }

// The worker refuses a subject the registry does not claim rather than running
// it on a guessed queue under a guessed deadline. Defaulting hid the case worth
// seeing: a task published on a subject nothing serves.
func TestASubjectNamingNoTaskIsRefusedTerminally(t *testing.T) {
	t.Parallel()

	err := processMessage(t.Context(), stubMsg{subject: "task.migration.somethingRetired"}, nil)
	if err == nil {
		t.Fatal("a subject naming no task was accepted")
	}
	if !eipnats.IsTerminal(err) {
		t.Error("the message would be redelivered until the consumer's ceiling")
	}
}
