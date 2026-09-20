package s3

import (
	"encoding/json"
	"os"
	"testing"
)

// bucketsPath is the committed fixture, relative to this package. It is written
// by services/shared/core/objectstore, which owns the list.
const bucketsPath = "../../../../testing/fixtures/object-store-buckets/buckets.json"

// committedBuckets is what the services open. This module cannot import
// objectstore — they are separate Go modules — so the fixture is the only thing
// connecting the list this package creates to the list they expect.
func committedBuckets(t *testing.T) []string {
	t.Helper()

	raw, err := os.ReadFile(bucketsPath)
	if err != nil {
		t.Fatalf("read the committed buckets: %v", err)
	}
	var fixture struct {
		Why     string   `json:"why"`
		Buckets []string `json:"buckets"`
	}
	if err := json.Unmarshal(raw, &fixture); err != nil {
		t.Fatalf("decode the committed buckets: %v", err)
	}
	if len(fixture.Buckets) == 0 {
		t.Fatalf("the committed bucket list is empty")
	}
	return fixture.Buckets
}

// A bucket the services open and this tool never creates fails at the first
// write, on the host — so the two lists are held together here rather than by
// the comments that used to say "keep in sync".
func TestAppBucketsMatchesTheCommittedList(t *testing.T) {
	t.Parallel()

	got := AppBuckets()
	want := committedBuckets(t)

	if len(got) != len(want) {
		t.Fatalf("AppBuckets has %d buckets, the committed list has %d:\ngot  %v\nwant %v",
			len(got), len(want), got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("bucket %d is %q, the committed list says %q:\ngot  %v\nwant %v",
				i, got[i], want[i], got, want)
		}
	}
}

// Every name this tool creates goes to weed shell, so an unsafe one is a
// command injected into the container rather than a bucket.
func TestEveryAppBucketIsSafeToCreate(t *testing.T) {
	t.Parallel()

	for _, name := range AppBuckets() {
		if err := requireSafeBucket(name); err != nil {
			t.Fatal(err)
		}
	}
}

func TestRequireSafeBucket(t *testing.T) {
	t.Parallel()
	if err := requireSafeBucket("static-data"); err != nil {
		t.Fatal(err)
	}
	for _, bad := range []string{"", "bad;drop", "a b", "x/y"} {
		if err := requireSafeBucket(bad); err == nil {
			t.Fatalf("want error for %q", bad)
		}
	}
}
