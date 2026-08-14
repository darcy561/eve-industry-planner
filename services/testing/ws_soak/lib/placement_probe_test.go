package soaklib

import (
	"testing"

	natscore "eve-industry-planner/shared/core/nats"

	natslib "github.com/nats-io/nats.go"
)

func TestPlacementWatcherSoftFull(t *testing.T) {
	t.Parallel()
	w := newPlacementWatcher()
	w.applyMsg(&natslib.Msg{Data: []byte(`{"container_id":"aaa111111111","clients":5,"soft":true,"full":false}`)})
	w.applyMsg(&natslib.Msg{Data: []byte(`{"container_id":"bbb222222222","clients":9,"soft":true,"full":true}`)})
	soft := w.softIDs()
	full := w.fullIDs()
	if len(soft) != 2 || soft[0] != "aaa111111111" || soft[1] != "bbb222222222" {
		t.Fatalf("soft %#v", soft)
	}
	if len(full) != 1 || full[0] != "bbb222222222" {
		t.Fatalf("full %#v", full)
	}
	// Clear soft on update.
	w.applyState(natscore.PlacementState{ContainerID: "aaa111111111", Clients: 1, Soft: false})
	if len(w.softIDs()) != 1 || w.softIDs()[0] != "bbb222222222" {
		t.Fatalf("soft after clear %#v", w.softIDs())
	}
}
