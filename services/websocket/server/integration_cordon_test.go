package server

import (
	"context"
	"net/http"
	"testing"

	"eve-industry-planner/shared/core/instanceid"
	"eve-industry-planner/shared/wsplacement"
)

func TestIntegrationConnectRefusedWhileCordoned(t *testing.T) {
	f := newIntegFixture(t)
	f.seedSession("acct-cordon", "sess-cordon")

	key := wsplacement.CordonPrefix + instanceid.Replica()
	if err := f.Redis.Set(context.Background(), key, "1", 0).Err(); err != nil {
		t.Fatal(err)
	}

	status, body := f.dialRefuse("sess-cordon")
	if status != http.StatusServiceUnavailable {
		t.Fatalf("status=%d want 503 body=%q", status, body)
	}
	if !stringContainsFold(body, "cordoned") {
		t.Fatalf("body=%q", body)
	}
}
