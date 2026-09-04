package esifake_test

import (
	"io"
	"net/http"
	"testing"

	"eve-industry-planner/shared/esiclient"
	"eve-industry-planner/testing/esifake"
)

func TestUnsetPathAnswersAnEmptyArray(t *testing.T) {
	fake := esifake.New(t)

	resp, err := fake.Do(t.Context(), esiclient.Request{Path: "/markets/prices/"})
	if err != nil {
		t.Fatalf("Do: %v", err)
	}
	if resp.Status != http.StatusOK || string(resp.Body) != "[]" {
		t.Errorf("default reply = %d %q", resp.Status, resp.Body)
	}
	fake.AssertCalled(http.MethodGet, "/markets/prices/", 1)
}

func TestQueueDrivesASequence(t *testing.T) {
	fake := esifake.New(t)
	fake.Queue(http.MethodGet, "/status/",
		esifake.Reply{Status: http.StatusOK, Body: `{"players":1}`},
		esifake.Reply{Status: http.StatusNotModified},
	)

	first, _ := fake.Do(t.Context(), esiclient.Request{Path: "/status/"})
	second, _ := fake.Do(t.Context(), esiclient.Request{Path: "/status/"})

	if first.Status != http.StatusOK {
		t.Errorf("first = %d", first.Status)
	}
	if !second.NotModified {
		t.Error("second should report a 304")
	}
	if second.Cost != 1 {
		t.Errorf("Cost = %d, want 1 for a conditional hit", second.Cost)
	}
}

func TestCallsRecordClassAndIdentity(t *testing.T) {
	fake := esifake.New(t)
	_, _ = fake.Do(t.Context(), esiclient.Request{
		Method: http.MethodPost,
		Path:   "/characters/affiliation/",
		Class:  esiclient.ClassUserRequested,
		Auth:   esiclient.Identity{CharacterID: 91316135},
		Body:   []byte(`[1]`),
	})

	calls := fake.CallsTo(http.MethodPost, "/characters/affiliation/")
	if len(calls) != 1 {
		t.Fatalf("recorded %d calls", len(calls))
	}
	if calls[0].Class != esiclient.ClassUserRequested {
		t.Errorf("Class = %s", calls[0].Class)
	}
	if calls[0].Auth.CharacterID != 91316135 {
		t.Errorf("Auth = %+v", calls[0].Auth)
	}
}

func TestStreamAndHeadroom(t *testing.T) {
	fake := esifake.New(t)
	fake.SetJSON(http.MethodGet, "/industry/systems/", http.StatusOK, `[{"solar_system_id":30000142}]`)

	stream, err := fake.Stream(t.Context(), esiclient.Request{Path: "/industry/systems/"})
	if err != nil {
		t.Fatalf("Stream: %v", err)
	}
	defer stream.Body.Close()

	read, _ := io.ReadAll(stream.Body)
	if len(read) == 0 || stream.Status != http.StatusOK {
		t.Errorf("stream = %q status %d", read, stream.Status)
	}

	fake.SetHeadroom(esiclient.ClassBackground, esiclient.Headroom{Known: true, Available: 12})
	ok, room, err := fake.CanAfford(t.Context(), "/industry/systems/", esiclient.Identity{}, esiclient.ClassBackground, 20)
	if err != nil {
		t.Fatalf("CanAfford: %v", err)
	}
	if ok {
		t.Error("20 tokens should not fit in 12")
	}
	if room.Available != 12 {
		t.Errorf("Available = %d", room.Available)
	}
}

func TestAnUndisclosedAllowanceAffords(t *testing.T) {
	// Mirrors the real store: nothing has said what the bucket allows, and
	// refusing on that basis would stop the call that would have said.
	fake := esifake.New(t)
	fake.SetHeadroom(esiclient.ClassBackground, esiclient.Headroom{Known: false, Available: 0})

	ok, _, err := fake.CanAfford(t.Context(), "/industry/systems/", esiclient.Identity{}, esiclient.ClassBackground, 370)
	if err != nil {
		t.Fatalf("CanAfford: %v", err)
	}
	if !ok {
		t.Error("an undisclosed allowance refused the work")
	}
}
