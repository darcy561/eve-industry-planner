package documentlock

import "testing"

func TestDecideHandoffCascadeRelease(t *testing.T) {
	t.Parallel()

	t.Run("nil_record_does_not_release", func(t *testing.T) {
		release, attrib := DecideHandoffCascadeRelease(nil, "sess-old")
		if release || attrib != "" {
			t.Fatalf("expected (false, \"\"), got (%v, %q)", release, attrib)
		}
	})

	t.Run("released_when_holder_matches_old", func(t *testing.T) {
		rec := &LockRecord{HolderSessionID: "sess-old"}
		release, attrib := DecideHandoffCascadeRelease(rec, "sess-old")
		if !release {
			t.Fatalf("expected release=true")
		}
		if attrib != "sess-old" {
			t.Fatalf("expected attrib=sess-old, got %q", attrib)
		}
	})

	t.Run("skipped_when_holder_differs", func(t *testing.T) {
		rec := &LockRecord{HolderSessionID: "sess-other"}
		release, attrib := DecideHandoffCascadeRelease(rec, "sess-old")
		if release || attrib != "" {
			t.Fatalf("expected (false, \"\"), got (%v, %q)", release, attrib)
		}
	})

	t.Run("skipped_when_holder_empty", func(t *testing.T) {
		rec := &LockRecord{HolderSessionID: ""}
		release, attrib := DecideHandoffCascadeRelease(rec, "sess-old")
		if release || attrib != "" {
			t.Fatalf("expected (false, \"\"), got (%v, %q)", release, attrib)
		}
	})
}

func TestDecideStaleAfterGrantRelease(t *testing.T) {
	t.Parallel()

	t.Run("nil_record_does_not_release", func(t *testing.T) {
		release, attrib := DecideStaleAfterGrantRelease(nil, "sess-new")
		if release || attrib != "" {
			t.Fatalf("expected (false, \"\"), got (%v, %q)", release, attrib)
		}
	})

	t.Run("empty_holder_does_not_release", func(t *testing.T) {
		rec := &LockRecord{HolderSessionID: ""}
		release, attrib := DecideStaleAfterGrantRelease(rec, "sess-new")
		if release || attrib != "" {
			t.Fatalf("expected (false, \"\"), got (%v, %q)", release, attrib)
		}
	})

	t.Run("skipped_when_holder_matches_new", func(t *testing.T) {
		rec := &LockRecord{HolderSessionID: "sess-new"}
		release, attrib := DecideStaleAfterGrantRelease(rec, "sess-new")
		if release || attrib != "" {
			t.Fatalf("expected (false, \"\"), got (%v, %q)", release, attrib)
		}
	})

	t.Run("released_with_attrib_when_holder_is_stale", func(t *testing.T) {
		rec := &LockRecord{HolderSessionID: "sess-stale"}
		release, attrib := DecideStaleAfterGrantRelease(rec, "sess-new")
		if !release {
			t.Fatalf("expected release=true")
		}
		if attrib != "sess-stale" {
			t.Fatalf("expected attrib=sess-stale, got %q", attrib)
		}
	})
}
