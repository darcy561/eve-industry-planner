package s3

import (
	"testing"
)

func TestAppBuckets(t *testing.T) {
	t.Parallel()
	got := AppBuckets()
	// Keep in sync with services/shared/core/objectstore BucketStaticData*.
	want := []string{"static-data", "static-data-test"}
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
