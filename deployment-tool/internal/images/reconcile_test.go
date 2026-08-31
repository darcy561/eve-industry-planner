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
