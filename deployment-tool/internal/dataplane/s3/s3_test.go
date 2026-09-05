package s3

import (
	"testing"
)

func TestAppBuckets(t *testing.T) {
	t.Parallel()
	got := AppBuckets()
	// static-data* keep in sync with services/shared/core/objectstore BucketStaticData*;
	// observability is the telemetry backend's store and has no app-side counterpart.
	want := []string{"static-data", "static-data-test", "observability"}
	if len(got) != len(want) {
		t.Fatalf("len=%d want %d", len(got), len(want))
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("[%d]=%q want %q", i, got[i], want[i])
		}
		if err := requireSafeBucket(got[i]); err != nil {
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
