package documentlocks

import "testing"

// TestBuildHandoffCompletedPayload locks in the variance the frontend already
// tolerates across the three publish sites:
//   - claim-handoff: previousHolderSessionID set, reason omitted.
//   - hand-over: both previousHolderSessionID and reason set.
//   - TTL promotion: reason set, previousHolderSessionID omitted (server has
//     already lost the previous-holder identity to Redis eviction).
//
// Optional fields must only appear in the resulting map when their option is
// non-empty so the wire shape matches exactly what the old inline literals
// produced.
func TestBuildHandoffCompletedPayload(t *testing.T) {
	t.Parallel()

	t.Run("claim_handoff_shape_omits_reason", func(t *testing.T) {
		p := buildHandoffCompletedPayload(
			"user_job_documents", "doc-1", "sess-new", 999,
			HandoffCompletedOpts{PreviousHolderSessionID: "sess-old"},
		)
		if p["type"] != LockEventHandoffCompleted {
			t.Fatalf("expected type=%s, got %v", LockEventHandoffCompleted, p["type"])
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
		p := buildHandoffCompletedPayload(
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
		p := buildHandoffCompletedPayload(
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
		p := buildHandoffCompletedPayload(
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
