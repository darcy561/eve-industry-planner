package sde

import (
	"context"
	jsonv1 "encoding/json"
	"testing"
	"time"

	"eve-industry-planner/shared/core/objectstore"
)

// memoryStore is the slice of Backend these four functions touch. The rest of
// the interface is unreachable from them and panics rather than pretending.
type memoryStore struct {
	objectstore.Backend
	objects map[string][]byte
}

func (m *memoryStore) Get(_ context.Context, key string) ([]byte, error) {
	data, ok := m.objects[key]
	if !ok {
		return nil, objectstore.ErrNotFound
	}
	return data, nil
}

func (m *memoryStore) Put(_ context.Context, key string, data []byte) error {
	m.objects[key] = data
	return nil
}

func newMemoryStore() *memoryStore { return &memoryStore{objects: map[string][]byte{}} }

// version.json and the lock survive a release and are read back by a later one,
// so a change to how they are written has to keep both halves agreeing — and
// keep agreeing with the bytes already sitting in object storage.
func TestVersionDocumentsRoundTrip(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	store := newMemoryStore()

	version := VersionJSON{
		Version:      "2025-03-11",
		BuildNumber:  2847,
		ReleaseDate:  "2025-03-11",
		Key:          "sde-20250311",
		DownloadURL:  "https://example.invalid/sde.zip",
		DownloadedAt: time.Date(2025, 3, 11, 9, 0, 0, 0, time.UTC),
		GeneratedAt:  time.Date(2025, 3, 11, 9, 30, 0, 0, time.UTC),
		Source:       "ccp",
	}
	if err := WriteVersionJSON(ctx, store, VersionObjectKey, version); err != nil {
		t.Fatal(err)
	}

	// The bytes are what a previous release left behind, so they must match what
	// that release would have written.
	want, err := jsonv1.MarshalIndent(version, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	if got := string(store.objects[VersionObjectKey]); got != string(want) {
		t.Fatalf("version.json bytes changed\n got: %s\nwant: %s", got, want)
	}

	readBack, err := ReadVersionJSON(ctx, store, VersionObjectKey)
	if err != nil {
		t.Fatal(err)
	}
	if *readBack != version {
		t.Fatalf("read back %+v, wrote %+v", *readBack, version)
	}

	lock := VersionLock{Version: "2025-03-11", BuildNumber: 2847, Source: "operator", Reason: "held for a rebuild"}
	if err := WriteVersionLock(ctx, store, lock); err != nil {
		t.Fatal(err)
	}
	gotLock, err := ReadVersionLock(ctx, store)
	if err != nil {
		t.Fatal(err)
	}
	if gotLock.Version != lock.Version || gotLock.BuildNumber != lock.BuildNumber || gotLock.Reason != lock.Reason {
		t.Fatalf("read back %+v, wrote %+v", *gotLock, lock)
	}
	// An unset LockedAt is stamped at write, so the lock always says when.
	if gotLock.LockedAt.IsZero() {
		t.Fatal("LockedAt was not stamped")
	}
}

// A missing document is absence, not failure: a first run has neither file.
func TestVersionDocumentsAbsentReadAsNil(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	store := newMemoryStore()

	v, err := ReadVersionJSON(ctx, store, VersionObjectKey)
	if err != nil || v != nil {
		t.Fatalf("v = %v, err = %v; want nil, nil", v, err)
	}
	lock, err := ReadVersionLock(ctx, store)
	if err != nil || lock != nil {
		t.Fatalf("lock = %v, err = %v; want nil, nil", lock, err)
	}
}
