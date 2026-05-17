package v1endpoints

import (
	"bytes"
	"encoding/json"
	"testing"

	"eve-industry-planner/shared/shared/models"
)

func TestSessionRotateResponseJSONRoundTrip(t *testing.T) {
	out := SessionRotateResponse{
		Kind:              sessionKindRotate,
		AccountID:         "acc",
		SessionID:         "sess",
		MainCharacterHash: "hash",
		ReauthRequiredAt:  1,
	}
	b, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(b, []byte("user_document")) || bytes.Contains(b, []byte("linked_characters")) {
		t.Fatalf("rotate JSON must not contain heavy bootstrap keys: %s", b)
	}
	var back SessionRotateResponse
	if err := json.Unmarshal(b, &back); err != nil {
		t.Fatal(err)
	}
	if back.Kind != sessionKindRotate || back.AccountID != "acc" {
		t.Fatalf("unexpected decode: %+v", back)
	}
}

func TestSessionBootstrapResponseJSONIncludesEsiOAuthStorage(t *testing.T) {
	out := SessionBootstrapResponse{
		Kind:            sessionKindBootstrap,
		EsiOAuthStorage: "server",
		AccountID:       "acc",
		SessionID:       "sess",
		UserDocument:    models.UserAccountDocument{},
	}
	b, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	var raw map[string]json.RawMessage
	if err := json.Unmarshal(b, &raw); err != nil {
		t.Fatal(err)
	}
	if _, ok := raw["esi_oauth_storage"]; !ok {
		t.Fatalf("expected esi_oauth_storage in %s", b)
	}
}
