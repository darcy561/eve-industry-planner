package archivedjobs

import (
	"slices"
	"strings"
	"testing"

	"eve-industry-planner/shared/models"
)

func jobFor(jobID, name string, itemID int, parents []string) models.Job {
	return models.Job{
		JobID:      jobID,
		Name:       name,
		ItemID:     itemID,
		ParentJobs: parents,
	}
}

// Everything a group holds is derivable from its jobs, which is what makes a
// deleted group recoverable.
func TestGroupIsRebuiltFromItsJobs(t *testing.T) {
	jobs := []models.Job{
		jobFor("job-out", "Rifter", 587, nil),
		jobFor("job-mid", "Tritanium", 34, []string{"job-out"}),
	}
	jobs[0].Build.Materials = []models.JobMaterial{{TypeID: 34}}
	jobs[0].APIJobs = []int{11}
	jobs[0].APIOrders = []int{22}
	jobs[1].APITransactions = []int{33}

	group := rebuildGroup("group-1", jobs)

	if group.GroupID != "group-1" {
		t.Fatalf("groupID = %q", group.GroupID)
	}
	if !slices.Equal(group.IncludedJobIDs, []string{"job-out", "job-mid"}) {
		t.Fatalf("includedJobIDs = %v", group.IncludedJobIDs)
	}
	if !slices.Equal(group.IncludedTypeIDs, []int{34, 587}) {
		t.Fatalf("includedTypeIDs = %v", group.IncludedTypeIDs)
	}
	if !slices.Equal(group.MaterialIDs, []int{34, 587}) {
		t.Fatalf("materialIDs = %v", group.MaterialIDs)
	}
	if !slices.Equal(group.LinkedJobIDs, []int64{11}) {
		t.Fatalf("linkedJobIDs = %v", group.LinkedJobIDs)
	}
	if !slices.Equal(group.LinkedOrderIDs, []int64{22}) {
		t.Fatalf("linkedOrderIDs = %v", group.LinkedOrderIDs)
	}
	if !slices.Equal(group.LinkedTransIDs, []int64{33}) {
		t.Fatalf("linkedTransIDs = %v", group.LinkedTransIDs)
	}
}

// The count and the name both depend on telling outputs from intermediates.
func TestOnlyParentlessJobsCountAsOutputs(t *testing.T) {
	group := rebuildGroup("group-1", []models.Job{
		jobFor("job-a", "Rifter", 587, nil),
		jobFor("job-b", "Punisher", 588, nil),
		jobFor("job-c", "Tritanium", 34, []string{"job-a"}),
	})
	if group.OutputJobCount != 2 {
		t.Fatalf("outputJobCount = %d, want 2", group.OutputJobCount)
	}
	if group.GroupName != "Rifter, Punisher" {
		t.Fatalf("groupName = %q", group.GroupName)
	}
}

// Progress was never recorded per job, so a rebuilt group must not claim it.
func TestWorkflowProgressResetsRatherThanBeingInvented(t *testing.T) {
	group := rebuildGroup("group-1", []models.Job{jobFor("job-a", "Rifter", 587, nil)})
	if group.GroupStatus != 0 {
		t.Fatalf("groupStatus = %d, want 0", group.GroupStatus)
	}
	if len(group.AreComplete) != 0 {
		t.Fatalf("areComplete = %v, want empty", group.AreComplete)
	}
	if !group.ShowComplete {
		t.Fatal("showComplete should take its default of true")
	}
	if group.GroupType != 1 {
		t.Fatalf("groupType = %d, want 1", group.GroupType)
	}
}

// An empty name would render as a blank row.
func TestGroupWithNoOutputsStillGetsAName(t *testing.T) {
	group := rebuildGroup("group-1", []models.Job{
		jobFor("job-a", "Tritanium", 34, []string{"job-elsewhere"}),
	})
	if group.GroupName != "Untitled Group" {
		t.Fatalf("groupName = %q", group.GroupName)
	}
}

// Capped as the SPA caps it, so the two cannot differ in length.
func TestGroupNameIsCappedLikeTheSPA(t *testing.T) {
	jobs := make([]models.Job, 0, 20)
	for i := range 20 {
		jobs = append(jobs, jobFor("job-"+string(rune('a'+i)), "LongProductName", 587, nil))
	}
	group := rebuildGroup("group-1", jobs)
	if len(group.GroupName) != groupNameLimit {
		t.Fatalf("groupName length = %d, want %d", len(group.GroupName), groupNameLimit)
	}
}

// Map order would rewrite an unchanged group as modified every time.
func TestRebuiltIdsAreStable(t *testing.T) {
	jobs := []models.Job{jobFor("job-a", "Rifter", 587, nil)}
	jobs[0].Build.Materials = []models.JobMaterial{{TypeID: 99}, {TypeID: 34}, {TypeID: 55}}

	first := rebuildGroup("group-1", jobs)
	second := rebuildGroup("group-1", jobs)
	if !slices.Equal(first.MaterialIDs, second.MaterialIDs) {
		t.Fatalf("material ids unstable: %v then %v", first.MaterialIDs, second.MaterialIDs)
	}
	if !slices.IsSorted(first.MaterialIDs) {
		t.Fatalf("material ids not sorted: %v", first.MaterialIDs)
	}
}

// A blank name would render as a stray comma in the group name.
func TestBlankOutputNamesAreSkipped(t *testing.T) {
	group := rebuildGroup("group-1", []models.Job{
		jobFor("job-a", "  ", 587, nil),
		jobFor("job-b", "Rifter", 588, nil),
	})
	if strings.Contains(group.GroupName, ",,") || strings.HasPrefix(group.GroupName, ",") {
		t.Fatalf("groupName has an empty fragment: %q", group.GroupName)
	}
	if group.GroupName != "Rifter" {
		t.Fatalf("groupName = %q", group.GroupName)
	}
}
