package server

import (
	"context"
	"errors"
	"testing"

	"eve-industry-planner/shared/models"
)

func lookupReturning(sequences map[string]uint64) lastSequenceLookup {
	return func(_ context.Context, subject string) (uint64, bool, error) {
		sequence, found := sequences[subject]
		return sequence, found, nil
	}
}

// A resume is answered from what the stream holds rather than from the handoff
// having been found. The handoff says the subscriptions moved across; it says
// nothing about what happened while the socket was down.
func TestResumeAnswersFromThePositionTheClientReached(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	tenants := []string{"account:acct-1", "corporation:corp-ref"}

	cases := []struct {
		name      string
		position  uint64
		sequences map[string]uint64
		missed    bool
	}{
		{
			name:      "nothing published since the client last applied",
			position:  40,
			sequences: map[string]uint64{"doc.update.account:acct-1.>": 40},
			missed:    false,
		},
		{
			name:      "the account's own documents moved on",
			position:  40,
			sequences: map[string]uint64{"doc.update.account:acct-1.>": 41},
			missed:    true,
		},
		{
			name:      "a planner the client reads moved on",
			position:  40,
			sequences: map[string]uint64{"doc.update.corporation:corp-ref.>": 55},
			missed:    true,
		},
		{
			name:      "nothing has ever been published for either",
			position:  40,
			sequences: map[string]uint64{},
			missed:    false,
		},
		{
			name:      "the client applied nothing, so it can know nothing",
			position:  0,
			sequences: map[string]uint64{"doc.update.account:acct-1.>": 2},
			missed:    true,
		},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			missed, err := resumeMissedChanges(ctx, c.position, tenants, lookupReturning(c.sequences))
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if missed != c.missed {
				t.Fatalf("missed = %v, want %v", missed, c.missed)
			}
		})
	}
}

// An answer nobody can give is "you missed something": a resume that wrongly
// says a client is current leaves it holding documents that have moved on, and
// nothing afterwards corrects it.
func TestResumeTreatsAnUnreadableStreamAsAGap(t *testing.T) {
	t.Parallel()
	failing := func(context.Context, string) (uint64, bool, error) {
		return 0, false, errors.New("stream unavailable")
	}

	missed, err := resumeMissedChanges(context.Background(), 40, []string{"account:acct-1"}, failing)
	if err == nil {
		t.Fatal("the failure was swallowed")
	}
	if !missed {
		t.Fatal("an unreadable stream was reported as nothing missed")
	}

	if missed, _ := resumeMissedChanges(context.Background(), 40, []string{"account:acct-1"}, nil); !missed {
		t.Fatal("no stream at all was reported as nothing missed")
	}
}

// The tenants are the connection's own, so a client cannot ask whether it missed
// anything in a planner it does not read.
func TestResumeTenantsAreTheConnectionsOwn(t *testing.T) {
	t.Parallel()
	client := &Client{
		AccountID: "acct-1",
		Scopes:    models.NewOwnerKeys().Add(models.AccountOwner("acct-1")),
	}
	client.Scopes = append(client.Scopes, "corporation:corp-ref")

	got := (&Server{}).resumeTenants(client)

	want := []string{"account:acct-1", "corporation:corp-ref"}
	if len(got) != len(want) {
		t.Fatalf("tenants = %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("tenants = %v, want %v", got, want)
		}
	}
}
