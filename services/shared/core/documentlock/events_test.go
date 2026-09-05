package documentlock

import (
	"testing"

	eipmongo "eve-industry-planner/shared/mongo"
)

func TestBuildHandoffCompletedPayload(t *testing.T) {
	t.Parallel()

	t.Run("claim_handoff_shape_omits_reason", func(t *testing.T) {
		p := BuildHandoffCompletedPayload(
			"user_job_documents", "doc-1", "sess-new", 999,
			HandoffCompletedOpts{PreviousHolderSessionID: "sess-old"},
		)
		if p[LockPayloadEventKey] != LockEventHandoffCompleted {
			t.Fatalf("expected event=%s, got %v", LockEventHandoffCompleted, p[LockPayloadEventKey])
		}
		if p["collection"] != "user_job_documents" || p["docID"] != "doc-1" {
			t.Fatalf("expected collection/docID round-trip, got %+v", p)
		}
		if p["sessionID"] != "sess-new" || p["expiresAtUnix"] != int64(999) {
			t.Fatalf("expected core fields, got %+v", p)
		}
		if p["previousHolderSessionID"] != "sess-old" {
			t.Fatalf("expected previousHolderSessionID=sess-old, got %v", p["previousHolderSessionID"])
		}
		if _, ok := p["reason"]; ok {
			t.Fatalf("expected reason omitted when not provided, got %+v", p)
		}
	})

	t.Run("hand_over_shape_has_both", func(t *testing.T) {
		p := BuildHandoffCompletedPayload(
			"user_job_groups", "group-7", "sess-new", 1234,
			HandoffCompletedOpts{
				PreviousHolderSessionID: "sess-old",
				Reason:                  LockHandoffReasonHolderHandover,
			},
		)
		if p["previousHolderSessionID"] != "sess-old" {
			t.Fatalf("expected previousHolderSessionID=sess-old, got %v", p["previousHolderSessionID"])
		}
		if p["reason"] != LockHandoffReasonHolderHandover {
			t.Fatalf("expected reason=%s, got %v", LockHandoffReasonHolderHandover, p["reason"])
		}
	})

	t.Run("ttl_promotion_shape_omits_previous_holder", func(t *testing.T) {
		p := BuildHandoffCompletedPayload(
			"user_job_groups", "group-9", "sess-promoted", 4242,
			HandoffCompletedOpts{Reason: LockHandoffReasonTTLPromotion},
		)
		if _, ok := p["previousHolderSessionID"]; ok {
			t.Fatalf("expected previousHolderSessionID omitted, got %+v", p)
		}
		if p["reason"] != LockHandoffReasonTTLPromotion {
			t.Fatalf("expected reason=%s, got %v", LockHandoffReasonTTLPromotion, p["reason"])
		}
	})

	t.Run("no_opts_only_required_fields", func(t *testing.T) {
		p := BuildHandoffCompletedPayload(
			"user_job_documents", "doc-empty", "sess-new", 0,
			HandoffCompletedOpts{},
		)
		if _, ok := p["previousHolderSessionID"]; ok {
			t.Fatalf("expected previousHolderSessionID omitted: %+v", p)
		}
		if _, ok := p["reason"]; ok {
			t.Fatalf("expected reason omitted: %+v", p)
		}
		if p["expiresAtUnix"] != int64(0) {
			t.Fatalf("expected expiresAtUnix=0 to round-trip, got %v", p["expiresAtUnix"])
		}
	})
}

func TestBuildGroupCascadePayload(t *testing.T) {
	t.Parallel()

	releases := []CascadeRelease{
		{JobID: "job-a", EvictedSessionID: "sess-old"},
		{JobID: "job-b", EvictedSessionID: "sess-old"},
	}
	p := BuildGroupCascadePayload(
		eipmongo.CollectionJobGroups,
		"group-1",
		eipmongo.CollectionJobDocuments,
		releases,
		LockReleaseReasonGroupHandoffCascade,
	)

	if p[LockPayloadEventKey] != LockEventGroupCascade {
		t.Fatalf("expected event=%s, got %v", LockEventGroupCascade, p[LockPayloadEventKey])
	}
	if p["groupCollection"] != eipmongo.CollectionJobGroups {
		t.Fatalf("groupCollection: got %v", p["groupCollection"])
	}
	if p["groupID"] != "group-1" {
		t.Fatalf("groupID: got %v", p["groupID"])
	}
	if p["collection"] != eipmongo.CollectionJobDocuments {
		t.Fatalf("collection: got %v", p["collection"])
	}
	if p["reason"] != LockReleaseReasonGroupHandoffCascade {
		t.Fatalf("reason: got %v", p["reason"])
	}
	items, _ := p["releases"].([]map[string]any)
	if len(items) != 2 {
		t.Fatalf("releases: want 2 entries, got %d (%v)", len(items), p["releases"])
	}
	if items[0]["docID"] != "job-a" || items[0]["sessionID"] != "sess-old" {
		t.Fatalf("releases[0]: got %v", items[0])
	}
	if items[1]["docID"] != "job-b" || items[1]["sessionID"] != "sess-old" {
		t.Fatalf("releases[1]: got %v", items[1])
	}
}

func TestBuildGroupCascadePayload_reasonVariants(t *testing.T) {
	t.Parallel()
	releases := []CascadeRelease{{JobID: "j1", EvictedSessionID: "s1"}}

	t.Run("membership_added", func(t *testing.T) {
		p := BuildGroupCascadePayload(
			eipmongo.CollectionJobGroups,
			"g99",
			eipmongo.CollectionJobDocuments,
			releases,
			LockReleaseReasonGroupMembershipAdded,
		)
		if p["reason"] != LockReleaseReasonGroupMembershipAdded {
			t.Fatalf("reason: got %v", p["reason"])
		}
	})

	t.Run("empty_reason_defaults_to_handoff_cascade", func(t *testing.T) {
		p := BuildGroupCascadePayload(
			eipmongo.CollectionJobGroups,
			"g98",
			eipmongo.CollectionJobDocuments,
			releases,
			"",
		)
		if p["reason"] != LockReleaseReasonGroupHandoffCascade {
			t.Fatalf("reason: got %v", p["reason"])
		}
	})
}
