package startup

import (
	"context"
	"testing"
	"time"

	objectstore "eve-industry-planner/shared/core/objectstore"
	sdecore "eve-industry-planner/shared/core/sde"
)

func TestEnsureLiveSDEExists_presentIsNoopWithoutNATS(t *testing.T) {
	b := objectstore.OpenTestStore(t)
	ctx := context.Background()
	for _, name := range sdecore.OutputFileNames() {
		if err := b.Put(ctx, sdecore.LiveKey(name), []byte(`{}`)); err != nil {
			t.Fatal(err)
		}
	}
	if err := sdecore.WriteRootVersionJSON(ctx, b, sdecore.VersionJSON{
		Version: "1_v1", BuildNumber: 1,
	}); err != nil {
		t.Fatal(err)
	}

	// Live set is complete; should return nil without needing NATS.
	if err := EnsureLiveSDEExists(ctx, nil, nil); err != nil {
		t.Fatalf("expected noop success when live SDE present: %v", err)
	}
}

func TestEnsureLiveSDEExists_missingRequiresNATS(t *testing.T) {
	_ = objectstore.OpenTestStore(t) // empty prefix
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	err := EnsureLiveSDEExists(ctx, nil, nil)
	if err == nil {
		t.Fatal("expected error when live SDE missing and NATS unavailable")
	}
}
