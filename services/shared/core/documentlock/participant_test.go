package documentlock

import (
	"encoding/json"
	"strings"
	"testing"

	documentlockfixture "eve-industry-planner/testing/fixtures/document-lock"
)

func TestParticipantID_namesASessionWithoutCarryingIt(t *testing.T) {
	t.Parallel()
	const session = "6f1c2a4e-1b9d-4c7e-9a3f-2d8b5e7c0a11"
	got := ParticipantID(session)
	if got == "" || strings.Contains(got, session) || strings.Contains(got, "6f1c2a4e") {
		t.Fatalf("ParticipantID = %q, want a digest that does not carry the session", got)
	}
	if got != ParticipantID(session) {
		t.Fatal("ParticipantID is not stable for one session")
	}
	if got == ParticipantID(session+"x") {
		t.Fatal("two sessions share a participant id")
	}
	if ParticipantID("") != "" {
		t.Fatal("no session should name no participant")
	}
}

func TestParticipantID_matchesTheFixtureBothSidesDeriveFrom(t *testing.T) {
	t.Parallel()
	var fixture struct {
		Domain        string `json:"domain"`
		SessionID     string `json:"sessionID"`
		ParticipantID string `json:"participantID"`
	}
	if err := json.Unmarshal(documentlockfixture.Participant, &fixture); err != nil {
		t.Fatalf("decode fixture: %v", err)
	}
	if fixture.Domain != participantDomain {
		t.Fatalf("fixture domain %q, code uses %q", fixture.Domain, participantDomain)
	}
	if got := ParticipantID(fixture.SessionID); got != fixture.ParticipantID {
		t.Fatalf("ParticipantID = %q, fixture says %q", got, fixture.ParticipantID)
	}
}
