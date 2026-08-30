package archivedjobs

import (
	"slices"
	"testing"

	"eve-industry-planner/shared/models"
)

// A related set can reach jobs archived from different groups, so each job goes
// back to its own.
func TestRestoredJobsAreSplitByTheirOwnGroup(t *testing.T) {
	t.Parallel()
	jobs := []models.Job{
		{JobID: "job-a", GroupID: "group-1"},
		{JobID: "job-b", GroupID: "group-2"},
		{JobID: "job-c", GroupID: "group-1"},
		{JobID: "job-d"},
	}

	order, byGroup := groupJobsByGroupID(jobs)

	if !slices.Equal(order, []string{"group-1", "group-2"}) {
		t.Fatalf("order = %v", order)
	}
	if got := jobIDsOf(byGroup["group-1"]); !slices.Equal(got, []string{"job-a", "job-c"}) {
		t.Fatalf("group-1 = %v", got)
	}
	if got := jobIDsOf(byGroup["group-2"]); !slices.Equal(got, []string{"job-b"}) {
		t.Fatalf("group-2 = %v", got)
	}
	if len(byGroup) != 2 {
		t.Fatalf("ungrouped job produced a group: %v", byGroup)
	}
}

func jobIDsOf(jobs []models.Job) []string {
	out := make([]string, 0, len(jobs))
	for i := range jobs {
		out = append(out, jobs[i].JobID)
	}
	return out
}
