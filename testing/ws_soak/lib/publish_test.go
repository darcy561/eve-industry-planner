package soaklib

import (
	"encoding/json"
	"testing"
)

func TestNewPublisherModes(t *testing.T) {
	p, err := NewPublisher(PublishNone)
	if err != nil || p == nil {
		t.Fatalf("none: %v %#v", err, p)
	}
	_ = p.Close()

	if _, err := NewPublisher(PublishMongo); err == nil {
		t.Fatal("mongo stub should error")
	}
	if _, err := NewPublisher(PublishMode("nope")); err == nil {
		t.Fatal("unknown mode should error")
	}
}

func TestParsePublishMode(t *testing.T) {
	got, err := ParsePublishMode("jetstream")
	if err != nil || got != PublishJetStream {
		t.Fatalf("got %q err=%v", got, err)
	}
	if _, err := ParsePublishMode("nope"); err == nil {
		t.Fatal("expected error")
	}
}

func TestMarshalFanoutPayloadOrg(t *testing.T) {
	const corpRef = "corp_56_JxK"
	raw, err := marshalFanoutPayload("doc.update.corporation:"+corpRef+".soakFanout.d1", soakFanoutCollection, "d1", DocUpdate{
		CorporationRef:  corpRef,
		ScopeAccountIDs: []string{"a", "b"},
	})
	if err != nil {
		t.Fatal(err)
	}
	var m map[string]any
	if err := json.Unmarshal(raw, &m); err != nil {
		t.Fatal(err)
	}
	// One owner key on the wire, as the watcher publishes it.
	if m["ownerKey"] != "corporation:"+corpRef {
		t.Fatalf("route=%v", m)
	}
	for _, retired := range []string{"accountID", "corporationRef", "allianceRef"} {
		if _, ok := m[retired]; ok {
			t.Fatalf("%s is still published: %v", retired, m)
		}
	}
	scopes, _ := m["scopes"].(map[string]any)
	ids, _ := scopes["accountIDs"].([]any)
	if len(ids) != 2 {
		t.Fatalf("scopes=%v", scopes)
	}
}
