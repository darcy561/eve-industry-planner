package documentlocks

import "testing"

// TestDecideHandoffCascadeRelease pins the predicate that drives
// releaseDependentJobLocksOnGroupHandoff: release only when the per-job lock
// is still owned by the previous group holder, attributing the emitted
// `document_lock_released` event to that same session.
func TestDecideHandoffCascadeRelease(t *testing.T) {
	t.Parallel()

	t.Run("nil_record_does_not_release", func(t *testing.T) {
		release, attrib := decideHandoffCascadeRelease(nil, "sess-old")
		if release || attrib != "" {
			t.Fatalf("expected (false, \"\"), got (%v, %q)", release, attrib)
		}
	})

	t.Run("released_when_holder_matches_old", func(t *testing.T) {
		rec := &lockRecord{HolderSessionID: "sess-old"}
		release, attrib := decideHandoffCascadeRelease(rec, "sess-old")
		if !release {
			t.Fatalf("expected release=true")
		}
		if attrib != "sess-old" {
			t.Fatalf("expected attrib=sess-old, got %q", attrib)
		}
	})

	t.Run("skipped_when_holder_differs", func(t *testing.T) {
		rec := &lockRecord{HolderSessionID: "sess-other"}
		release, attrib := decideHandoffCascadeRelease(rec, "sess-old")
		if release || attrib != "" {
			t.Fatalf("expected (false, \"\"), got (%v, %q)", release, attrib)
		}
	})

	t.Run("skipped_when_holder_empty", func(t *testing.T) {
		rec := &lockRecord{HolderSessionID: ""}
		release, attrib := decideHandoffCascadeRelease(rec, "sess-old")
		if release || attrib != "" {
			t.Fatalf("expected (false, \"\"), got (%v, %q)", release, attrib)
		}
	})
}

// TestDecideStaleAfterGrantRelease pins the predicate that drives
// ReleaseStaleDependentJobLocksAfterGroupGrant: release any per-job lock not
// owned by the new group holder, attributing the emitted
// `document_lock_released` to whichever stale session was evicted.
func TestDecideStaleAfterGrantRelease(t *testing.T) {
	t.Parallel()

	t.Run("nil_record_does_not_release", func(t *testing.T) {
		release, attrib := decideStaleAfterGrantRelease(nil, "sess-new")
		if release || attrib != "" {
			t.Fatalf("expected (false, \"\"), got (%v, %q)", release, attrib)
		}
	})

	t.Run("empty_holder_does_not_release", func(t *testing.T) {
		rec := &lockRecord{HolderSessionID: ""}
		release, attrib := decideStaleAfterGrantRelease(rec, "sess-new")
		if release || attrib != "" {
			t.Fatalf("expected (false, \"\"), got (%v, %q)", release, attrib)
		}
	})

	t.Run("skipped_when_holder_matches_new", func(t *testing.T) {
		rec := &lockRecord{HolderSessionID: "sess-new"}
		release, attrib := decideStaleAfterGrantRelease(rec, "sess-new")
		if release || attrib != "" {
			t.Fatalf("expected (false, \"\"), got (%v, %q)", release, attrib)
		}
	})

	t.Run("released_with_attrib_when_holder_is_stale", func(t *testing.T) {
		rec := &lockRecord{HolderSessionID: "sess-stale"}
		release, attrib := decideStaleAfterGrantRelease(rec, "sess-new")
		if !release {
			t.Fatalf("expected release=true")
		}
		if attrib != "sess-stale" {
			t.Fatalf("expected attrib=sess-stale, got %q", attrib)
		}
	})
}
