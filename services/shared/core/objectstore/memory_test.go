package objectstore

import (
	"context"
	"slices"
	"testing"
	"time"
)

// A fake a caller cannot substitute for the real thing is not a fake.
var _ Backend = (*MemoryBackend)(nil)

func TestAMissingKeyIsNotFoundRatherThanEmpty(t *testing.T) {
	t.Parallel()
	b := NewMemoryBackend()

	if _, err := b.Get(context.Background(), "nothing/here"); err != ErrNotFound {
		t.Fatalf("Get of a missing key returned %v, want ErrNotFound", err)
	}
	if _, err := b.Stat(context.Background(), "nothing/here"); err != ErrNotFound {
		t.Fatalf("Stat of a missing key returned %v, want ErrNotFound", err)
	}

	held, err := b.Exists(context.Background(), "nothing/here")
	if err != nil {
		t.Fatalf("Exists: %v", err)
	}
	if held {
		t.Fatal("Exists reported a key nothing was put at")
	}
}

// A caller that reads a page and sorts it in place must not be sorting what the
// store holds.
func TestWhatIsReadIsACopy(t *testing.T) {
	t.Parallel()
	b := NewMemoryBackend()
	ctx := context.Background()

	original := []byte(`[{"order_id":1}]`)
	if err := b.Put(ctx, "pages/1", original); err != nil {
		t.Fatalf("Put: %v", err)
	}
	original[2] = 'X' // the caller still holds the slice it passed in

	read, err := b.Get(ctx, "pages/1")
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if string(read) != `[{"order_id":1}]` {
		t.Fatalf("the store kept the caller's slice: %s", read)
	}

	read[2] = 'Y'
	again, err := b.Get(ctx, "pages/1")
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if string(again) != `[{"order_id":1}]` {
		t.Fatalf("mutating what was read reached the store: %s", again)
	}
}

// S3 normalises on the way in, so two spellings of one key are one object.
func TestKeysAreNormalisedLikeS3(t *testing.T) {
	t.Parallel()
	b := NewMemoryBackend()
	ctx := context.Background()

	if err := b.Put(ctx, `market\10000002\page\1`, []byte("a")); err != nil {
		t.Fatalf("Put: %v", err)
	}
	if err := b.Put(ctx, "/market/10000002/page/1", []byte("b")); err != nil {
		t.Fatalf("Put: %v", err)
	}

	if b.Len() != 1 {
		t.Fatalf("held %d objects, want the two spellings to be one key", b.Len())
	}
	read, err := b.Get(ctx, "market/10000002/page/1")
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if string(read) != "b" {
		t.Fatalf("read %q, want the later write", read)
	}
}

func TestListKeysIsRecursiveAndSorted(t *testing.T) {
	t.Parallel()
	b := NewMemoryBackend()
	ctx := context.Background()

	for _, key := range []string{
		"market/10000002/page/2",
		"market/10000002/page/1",
		"market/10000043/page/1",
	} {
		if err := b.Put(ctx, key, []byte("x")); err != nil {
			t.Fatalf("Put %s: %v", key, err)
		}
	}

	keys, err := b.ListKeys(ctx, "market/10000002/")
	if err != nil {
		t.Fatalf("ListKeys: %v", err)
	}
	want := []string{"market/10000002/page/1", "market/10000002/page/2"}
	if !slices.Equal(keys, want) {
		t.Fatalf("ListKeys = %v, want %v", keys, want)
	}
}

// The child listing collapses everything below one level, which is what makes
// it different from ListKeys rather than a filtered version of it.
func TestListChildNamesCollapsesToOneLevel(t *testing.T) {
	t.Parallel()
	b := NewMemoryBackend()
	ctx := context.Background()

	for _, key := range []string{
		"market/10000002/page/1",
		"market/10000002/page/2",
		"market/10000043/page/1",
	} {
		if err := b.Put(ctx, key, []byte("x")); err != nil {
			t.Fatalf("Put %s: %v", key, err)
		}
	}

	names, err := b.ListChildNames(ctx, "market")
	if err != nil {
		t.Fatalf("ListChildNames: %v", err)
	}
	want := []string{"10000002", "10000043"}
	if !slices.Equal(names, want) {
		t.Fatalf("ListChildNames = %v, want %v", names, want)
	}
}

// Dropping a region's whole book in one call is why the pages are here.
func TestDeletePrefixRemovesOnlyItsOwnSubtree(t *testing.T) {
	t.Parallel()
	b := NewMemoryBackend()
	ctx := context.Background()

	for _, key := range []string{
		"market/10000002/page/1",
		"market/10000002/page/2",
		"market/10000043/page/1",
	} {
		if err := b.Put(ctx, key, []byte("x")); err != nil {
			t.Fatalf("Put %s: %v", key, err)
		}
	}

	if err := b.DeletePrefix(ctx, "market/10000002/"); err != nil {
		t.Fatalf("DeletePrefix: %v", err)
	}
	if b.Len() != 1 {
		t.Fatalf("held %d objects after dropping one region, want 1", b.Len())
	}
	if _, err := b.Get(ctx, "market/10000043/page/1"); err != nil {
		t.Fatalf("the other region's page went too: %v", err)
	}
}

// Deleting what is not there is how S3 behaves, and a caller retrying a failed
// sweep depends on it.
func TestDeletingWhatIsNotHeldIsNotAnError(t *testing.T) {
	t.Parallel()
	b := NewMemoryBackend()

	if err := b.Delete(context.Background(), "never/written"); err != nil {
		t.Fatalf("Delete of a missing key: %v", err)
	}
	if err := b.DeletePrefix(context.Background(), "never/"); err != nil {
		t.Fatalf("DeletePrefix of a missing prefix: %v", err)
	}
}

func TestCopyPrefixReparentsTheSubtree(t *testing.T) {
	t.Parallel()
	b := NewMemoryBackend()
	ctx := context.Background()

	if err := b.Put(ctx, "live/one", []byte("1")); err != nil {
		t.Fatalf("Put: %v", err)
	}
	if err := b.Put(ctx, "live/nested/two", []byte("2")); err != nil {
		t.Fatalf("Put: %v", err)
	}

	if err := b.CopyPrefix(ctx, "live", "backup"); err != nil {
		t.Fatalf("CopyPrefix: %v", err)
	}

	keys, err := b.ListKeys(ctx, "backup/")
	if err != nil {
		t.Fatalf("ListKeys: %v", err)
	}
	want := []string{"backup/nested/two", "backup/one"}
	if !slices.Equal(keys, want) {
		t.Fatalf("copied to %v, want %v", keys, want)
	}

	if _, err := b.Get(ctx, "live/one"); err != nil {
		t.Fatalf("the source went: %v", err)
	}
}

// ModTime is what a retention sweep reads, so it has to be settable.
func TestStatReportsSizeAndTheClocksTime(t *testing.T) {
	t.Parallel()
	b := NewMemoryBackend()
	at := time.Date(2026, 9, 20, 12, 0, 0, 0, time.UTC)
	b.SetClock(func() time.Time { return at })

	if err := b.Put(context.Background(), "pages/1", []byte("hello")); err != nil {
		t.Fatalf("Put: %v", err)
	}

	info, err := b.Stat(context.Background(), "pages/1")
	if err != nil {
		t.Fatalf("Stat: %v", err)
	}
	if info.Size != 5 {
		t.Errorf("Size = %d, want 5", info.Size)
	}
	if !info.ModTime.Equal(at) {
		t.Errorf("ModTime = %s, want %s", info.ModTime, at)
	}
	if info.Key != "pages/1" {
		t.Errorf("Key = %q, want the normalised key", info.Key)
	}
}

// A cancelled context must stop the store, not be ignored because it is local.
func TestACancelledContextIsRefused(t *testing.T) {
	t.Parallel()
	b := NewMemoryBackend()
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	if err := b.Put(ctx, "pages/1", []byte("x")); err == nil {
		t.Error("Put accepted a cancelled context")
	}
	if _, err := b.Get(ctx, "pages/1"); err == nil {
		t.Error("Get accepted a cancelled context")
	}
	if _, err := b.ListKeys(ctx, ""); err == nil {
		t.Error("ListKeys accepted a cancelled context")
	}
}
