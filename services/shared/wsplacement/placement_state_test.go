package wsplacement

import (
	"encoding/json"
	"testing"

	eipnats "eve-industry-planner/shared/nats"
)

func TestFlagsFromCounts(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name           string
		clients        int
		target, cutoff int
		soft, full     bool
	}{
		{name: "both_off", clients: 100, target: 0, cutoff: 0, soft: false, full: false},
		{name: "below_both", clients: 5, target: 10, cutoff: 20, soft: false, full: false},
		{name: "at_soft", clients: 10, target: 10, cutoff: 20, soft: true, full: false},
		{name: "at_full", clients: 20, target: 10, cutoff: 20, soft: true, full: true},
		{name: "soft_off_full_on", clients: 20, target: 0, cutoff: 20, soft: false, full: true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			soft, full := FlagsFromCounts(tc.clients, tc.target, tc.cutoff)
			if soft != tc.soft || full != tc.full {
				t.Fatalf("FlagsFromCounts(%d,%d,%d)=(%v,%v) want (%v,%v)",
					tc.clients, tc.target, tc.cutoff, soft, full, tc.soft, tc.full)
			}
		})
	}
}

func TestNewPlacementStateAndRoundTrip(t *testing.T) {
	t.Parallel()
	s := NewPlacementState("abc123456789", 12, 10, 20, false)
	if !s.Soft || s.Full || s.Draining || s.Clients != 12 || s.ContainerID != "abc123456789" {
		t.Fatalf("unexpected state: %+v", s)
	}
	if s.MessageType() != eipnats.MessageTypeWSPlacement {
		t.Fatalf("MessageType=%q", s.MessageType())
	}
	raw, err := json.Marshal(s)
	if err != nil {
		t.Fatal(err)
	}
	got, err := eipnats.ParsePlacementState(raw)
	if err != nil {
		t.Fatal(err)
	}
	if got != s {
		t.Fatalf("round-trip: got %+v want %+v", got, s)
	}
}

func TestPlacementContracts(t *testing.T) {
	t.Parallel()
	if eipnats.SubjectWSPlacementState != "ws.placement.state" {
		t.Fatalf("SubjectWSPlacementState=%q", eipnats.SubjectWSPlacementState)
	}
	if StatusPath != "/placement" {
		t.Fatalf("StatusPath=%q", StatusPath)
	}
}
