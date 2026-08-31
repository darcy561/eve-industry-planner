package nats

import "testing"

func TestParsePlacementStateRequiresContainerID(t *testing.T) {
	t.Parallel()
	if _, err := ParsePlacementState([]byte(`{"clients":1}`)); err == nil {
		t.Fatal("expected error for missing container_id")
	}
}
