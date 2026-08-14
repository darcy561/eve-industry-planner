package swarm

import (
	"testing"
)

func TestByServiceOmitsUnsetOptional(t *testing.T) {
	t.Parallel()
	o := SecretsOverlay{
		KeyToObj: map[string]string{
			"MONGO_PASSWORD": "eip_MONGO_PASSWORD_aaa",
			"REDIS_PASSWORD": "eip_REDIS_PASSWORD_bbb",
		},
		Attach: []Attach{
			{Service: "api", Key: "MONGO_PASSWORD"},
			{Service: "api", Key: "FEEDBACK_DISCORD_WEBHOOK_URL"}, // optional, unset
			{Service: "worker", Key: "MONGO_PASSWORD"},
		},
	}
	by, err := o.ByService()
	if err != nil {
		t.Fatal(err)
	}
	if len(by["api"]) != 1 || by["api"][0] != "MONGO_PASSWORD" {
		t.Fatalf("api: %#v", by["api"])
	}
	if len(by["worker"]) != 1 || by["worker"][0] != "MONGO_PASSWORD" {
		t.Fatalf("worker: %#v", by["worker"])
	}
}

func TestByServiceFailsMissingRequired(t *testing.T) {
	t.Parallel()
	o := SecretsOverlay{
		KeyToObj: map[string]string{},
		Attach:   []Attach{{Service: "api", Key: "MONGO_PASSWORD"}},
	}
	if _, err := o.ByService(); err == nil {
		t.Fatal("expected error")
	}
}
