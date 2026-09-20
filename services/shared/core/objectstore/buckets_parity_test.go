// Which buckets the object store holds, written down where the Deployment Tool
// can read it.
//
// Two modules carry this list and neither imports the other: this package names
// the buckets the services open, and the Deployment Tool's s3 package names the
// ones it creates and verifies. A bucket added here and forgotten there is a
// bucket every service opens and no deployment ever creates — which fails at
// first write, on the host, rather than in either module's tests.
//
// So the list is derived from SeedBuckets, committed, and checked here. The
// Deployment Tool's own parity test reads the same file.
package objectstore

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// bucketsPath is the committed fixture, relative to this package.
const bucketsPath = "../../../../testing/fixtures/object-store-buckets/buckets.json"

const regenerateBuckets = "EIP_UPDATE_OBJECT_STORE_BUCKETS=1 go test ./shared/core/objectstore/ -run TestTheBucketListIsCurrent"

const bucketsWhy = "The buckets this object store holds, from " +
	"objectstore.SeedBuckets. The Deployment Tool creates and verifies its own " +
	"copy, and nothing but this file connects the two. " +
	"Regenerate with: " + regenerateBuckets

// bucketList is ordered, because the order is part of the agreement: the
// Deployment Tool creates them in the order it is given, and a fixture that did
// not fix the order would let the two lists differ in it without failing.
type bucketList struct {
	Why     string   `json:"why"`
	Buckets []string `json:"buckets"`
}

func currentBuckets() bucketList {
	return bucketList{Why: bucketsWhy, Buckets: SeedBucketNames()}
}

// Adding a bucket changes what a deployment must create before any service can
// write to it, so the committed list has to move with it in the same commit.
func TestTheBucketListIsCurrent(t *testing.T) {
	encoded, err := json.MarshalIndent(currentBuckets(), "", "  ")
	if err != nil {
		t.Fatalf("encode the buckets: %v", err)
	}
	encoded = append(encoded, '\n')

	if os.Getenv("EIP_UPDATE_OBJECT_STORE_BUCKETS") == "1" {
		if err := os.MkdirAll(filepath.Dir(bucketsPath), 0o755); err != nil {
			t.Fatalf("create the fixture directory: %v", err)
		}
		if err := os.WriteFile(bucketsPath, encoded, 0o644); err != nil {
			t.Fatalf("write the buckets: %v", err)
		}
		t.Logf("wrote %s", bucketsPath)
		return
	}

	committed, err := os.ReadFile(bucketsPath)
	if err != nil {
		t.Fatalf("read the committed buckets: %v\nregenerate with: %s", err, regenerateBuckets)
	}
	if string(committed) != string(encoded) {
		t.Fatalf("the committed bucket list is stale.\n"+
			"SeedBuckets changed without %s moving with it, so a deployment "+
			"creates a different set of buckets from the one the services open.\n"+
			"Regenerate with: %s", bucketsPath, regenerateBuckets)
	}
}

// SeedBuckets is handed to the object store as one string, so a name carrying
// the separator would silently become two buckets.
func TestNoBucketNameCarriesTheSeparator(t *testing.T) {
	t.Parallel()

	for _, name := range SeedBucketNames() {
		if strings.Contains(name, ",") {
			t.Errorf("bucket %q contains the list separator", name)
		}
		if strings.TrimSpace(name) != name || name == "" {
			t.Errorf("bucket %q is empty or padded", name)
		}
	}
}

// Two buckets sharing a name is a list that reads as longer than it is.
func TestEveryBucketNameIsDistinct(t *testing.T) {
	t.Parallel()

	seen := map[string]bool{}
	for _, name := range SeedBucketNames() {
		if seen[name] {
			t.Errorf("%q is listed twice", name)
		}
		seen[name] = true
	}
}
