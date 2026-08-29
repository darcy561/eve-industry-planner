package archivedjobs

import "testing"

func summary(jobID string, parents []string, children map[string][]string) ArchivedJobSummary {
	return ArchivedJobSummary{
		JobID:      jobID,
		ParentJobs: parents,
		ChildJobs:  children,
	}
}

// A job linking to nothing is a standalone row, not a set of one.
func TestUnlinkedJobsGetNoSetID(t *testing.T) {
	sets := relatedSetIDs([]ArchivedJobSummary{
		summary("job-a", nil, nil),
		summary("job-b", nil, nil),
	})
	if len(sets) != 0 {
		t.Fatalf("expected no related sets, got %v", sets)
	}
}

// A parent naming its child and a child naming its parent describe one edge.
func TestChainSharesOneSetIDInBothDirections(t *testing.T) {
	sets := relatedSetIDs([]ArchivedJobSummary{
		summary("job-parent", nil, map[string][]string{"34": {"job-child"}}),
		summary("job-child", []string{"job-parent"}, nil),
	})
	if sets["job-parent"] == "" || sets["job-child"] == "" {
		t.Fatalf("both jobs should carry a set id, got %v", sets)
	}
	if sets["job-parent"] != sets["job-child"] {
		t.Fatalf("chain split across sets: %v", sets)
	}
}

// Jobs joined through a middle one are a single set, not two that touch.
func TestTransitiveChainIsOneSet(t *testing.T) {
	sets := relatedSetIDs([]ArchivedJobSummary{
		summary("job-a", nil, map[string][]string{"34": {"job-b"}}),
		summary("job-b", []string{"job-a"}, map[string][]string{"35": {"job-c"}}),
		summary("job-c", []string{"job-b"}, nil),
	})
	if sets["job-a"] != sets["job-c"] {
		t.Fatalf("transitively linked jobs split across sets: %v", sets)
	}
}

// The id must not depend on row order, or a client keying a collapsed block on
// it would see it change between pages.
func TestSetIDIsStableAcrossRowOrder(t *testing.T) {
	forward := relatedSetIDs([]ArchivedJobSummary{
		summary("job-a", nil, map[string][]string{"34": {"job-b"}}),
		summary("job-b", []string{"job-a"}, nil),
	})
	reversed := relatedSetIDs([]ArchivedJobSummary{
		summary("job-b", []string{"job-a"}, nil),
		summary("job-a", nil, map[string][]string{"34": {"job-b"}}),
	})
	if forward["job-a"] != reversed["job-a"] {
		t.Fatalf("set id changed with row order: %q then %q", forward["job-a"], reversed["job-a"])
	}
	if forward["job-a"] != "job-a" {
		t.Fatalf("set id should be the lowest member, got %q", forward["job-a"])
	}
}

// Union-find leaking between chains would merge the whole page into one block.
func TestSeparateChainsGetSeparateSets(t *testing.T) {
	sets := relatedSetIDs([]ArchivedJobSummary{
		summary("job-a", nil, map[string][]string{"34": {"job-b"}}),
		summary("job-b", []string{"job-a"}, nil),
		summary("job-x", nil, map[string][]string{"34": {"job-y"}}),
		summary("job-y", []string{"job-x"}, nil),
	})
	if sets["job-a"] == sets["job-x"] {
		t.Fatalf("unrelated chains merged into one set: %v", sets)
	}
}

// An off-page link still marks the job as linked, but joins no rows.
func TestLinkOutsideThePageStillMarksTheJobAsLinked(t *testing.T) {
	sets := relatedSetIDs([]ArchivedJobSummary{
		summary("job-a", []string{"job-not-on-this-page"}, nil),
	})
	if sets["job-a"] != "job-a" {
		t.Fatalf("expected job-a to head its own set, got %v", sets)
	}
}

// A self-edge would report a standalone job as linked.
func TestSelfReferenceIsNotALink(t *testing.T) {
	sets := relatedSetIDs([]ArchivedJobSummary{
		summary("job-a", []string{"job-a"}, nil),
	})
	if len(sets) != 0 {
		t.Fatalf("a self-reference should not make a set, got %v", sets)
	}
}

// A chain can straddle the archive boundary; the walk must not invent the half
// that is still in the planner.
func TestArchiveWalkReturnsOnlyArchivedJobs(t *testing.T) {
	jobs := []ArchivedJobSummary{
		summary("job-a", nil, map[string][]string{"34": {"job-b", "job-still-in-planner"}}),
		summary("job-b", []string{"job-a"}, nil),
	}
	got := relatedJobIDsInArchive(jobs, "job-a")
	want := []string{"job-a", "job-b"}
	if len(got) != len(want) {
		t.Fatalf("walk returned %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("walk returned %v, want %v", got, want)
		}
	}
}

// Never restore a job the archive does not hold, including the starting id.
func TestArchiveWalkFromAbsentJobReturnsNothing(t *testing.T) {
	jobs := []ArchivedJobSummary{summary("job-a", nil, nil)}
	if got := relatedJobIDsInArchive(jobs, "job-missing"); len(got) != 0 {
		t.Fatalf("expected no jobs, got %v", got)
	}
}

// Job links are user data, so the graph cannot be assumed acyclic.
func TestArchiveWalkTerminatesOnACycle(t *testing.T) {
	jobs := []ArchivedJobSummary{
		summary("job-a", []string{"job-b"}, map[string][]string{"34": {"job-b"}}),
		summary("job-b", []string{"job-a"}, map[string][]string{"34": {"job-a"}}),
	}
	if got := relatedJobIDsInArchive(jobs, "job-a"); len(got) != 2 {
		t.Fatalf("expected both jobs once, got %v", got)
	}
}
