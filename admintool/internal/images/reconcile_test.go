package images

import "testing"

func TestDigestsMatch(t *testing.T) {
	a := "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
	b := "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
	if !DigestsMatch(a, b) {
		t.Fatal("identical digests should match")
	}
	if !DigestsMatch("repo@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", a) {
		t.Fatal("repo@digest should match bare digest")
	}
	if DigestsMatch(a, "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb") {
		t.Fatal("different digests should not match")
	}
	if DigestsMatch("", a) || DigestsMatch(a, "") {
		t.Fatal("empty digest should not match")
	}
}

func TestDigestFromImageRef(t *testing.T) {
	got := DigestFromImageRef("ghcr.io/x/api:0.8@sha256:deadbeef")
	if got != "sha256:deadbeef" {
		t.Fatalf("got %q", got)
	}
	if DigestFromImageRef("ghcr.io/x/api:0.8") != "" {
		t.Fatal("expected empty without @digest")
	}
}
