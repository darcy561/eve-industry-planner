package archivestats

import (
	"slices"
	"testing"

	"eve-industry-planner/shared/models"
)

func linked(refs ...string) []models.LinkedESIJob {
	out := make([]models.LinkedESIJob, 0, len(refs))
	for i, ref := range refs {
		out = append(out, models.LinkedESIJob{JobID: 500 + i, CorporationRef: ref})
	}
	return out
}

func TestInferJobCorp(t *testing.T) {
	t.Parallel()

	for _, tc := range []struct {
		name      string
		linked    []models.LinkedESIJob
		wantRef   string
		wantState CorpInference
	}{
		{"no linked jobs", nil, "", CorpInferenceNone},
		{"linked jobs with no corporation", linked("", ""), "", CorpInferenceNone},
		{"one corporation", linked("corp_a"), "corp_a", CorpInferenceKnown},
		{"the same corporation repeated", linked("corp_a", "corp_a", "corp_a"), "corp_a", CorpInferenceKnown},
		{"one corporation among blanks", linked("", "corp_a", ""), "corp_a", CorpInferenceKnown},
		// Attributing a line to the wrong corporation is worse than to none: a
		// corporation aggregate would count revenue it never earned.
		{"two corporations", linked("corp_a", "corp_b"), "", CorpInferenceAmbiguous},
		{"three corporations", linked("corp_a", "corp_b", "corp_c"), "", CorpInferenceAmbiguous},
	} {
		t.Run(tc.name, func(t *testing.T) {
			ref, state := InferJobCorp(tc.linked)
			if ref != tc.wantRef || state != tc.wantState {
				t.Fatalf("InferJobCorp = (%q, %q), want (%q, %q)", ref, state, tc.wantRef, tc.wantState)
			}
		})
	}
}

// A rebuild must produce the same document as the run before it, so the refs are
// sorted rather than left in map order.
func TestDistinctLinkedIndustryCorpRefsIsSortedAndDeduped(t *testing.T) {
	t.Parallel()

	got := DistinctLinkedIndustryCorpRefs(linked("corp_c", "corp_a", "corp_b", "corp_a", ""))
	want := []string{"corp_a", "corp_b", "corp_c"}
	if !slices.Equal(got, want) {
		t.Fatalf("refs = %v, want %v", got, want)
	}
	if DistinctLinkedIndustryCorpRefs(nil) != nil {
		t.Fatal("no linked jobs must yield no refs, not an empty slice")
	}
}
