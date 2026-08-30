package models

import (
	"encoding/json"
	"os"
	"path/filepath"
	"slices"
	"testing"
)

// corpusPath is the shared case file, read from the repo root rather than copied
// here: the SPA reads the same file, and a rule may not change on one side alone.
const groupCorpusPath = "../../../testing/fixtures/group-derivation/cases.json"

type groupCorpusCase struct {
	Name     string `json:"name"`
	Why      string `json:"why"`
	Jobs     []Job  `json:"jobs"`
	Expected struct {
		GroupName       string   `json:"groupName"`
		IncludedJobIDs  []string `json:"includedJobIDs"`
		IncludedTypeIDs []int    `json:"includedTypeIDs"`
		MaterialIDs     []int    `json:"materialIDs"`
		OutputJobCount  int      `json:"outputJobCount"`
		LinkedJobIDs    []int64  `json:"linkedJobIDs"`
		LinkedOrderIDs  []int64  `json:"linkedOrderIDs"`
		LinkedTransIDs  []int64  `json:"linkedTransIDs"`
	} `json:"expected"`
}

func loadGroupCorpus(t *testing.T) []groupCorpusCase {
	t.Helper()
	raw, err := os.ReadFile(filepath.FromSlash(groupCorpusPath))
	if err != nil {
		t.Fatalf("read corpus: %v", err)
	}
	var doc struct {
		Cases []groupCorpusCase `json:"cases"`
	}
	if err := json.Unmarshal(raw, &doc); err != nil {
		t.Fatalf("decode corpus: %v", err)
	}
	if len(doc.Cases) == 0 {
		t.Fatal("corpus is empty")
	}
	return doc.Cases
}

func TestRebuildMatchesTheCorpus(t *testing.T) {
	t.Parallel()
	for _, tc := range loadGroupCorpus(t) {
		t.Run(tc.Name, func(t *testing.T) {
			got := Group{GroupID: "group-1"}.RebuildFrom(tc.Jobs)

			if got.GroupName != tc.Expected.GroupName {
				t.Errorf("groupName = %q, want %q\n%s", got.GroupName, tc.Expected.GroupName, tc.Why)
			}
			if !slices.Equal(got.IncludedJobIDs, tc.Expected.IncludedJobIDs) {
				t.Errorf("includedJobIDs = %v, want %v", got.IncludedJobIDs, tc.Expected.IncludedJobIDs)
			}
			if !slices.Equal(got.IncludedTypeIDs, tc.Expected.IncludedTypeIDs) {
				t.Errorf("includedTypeIDs = %v, want %v", got.IncludedTypeIDs, tc.Expected.IncludedTypeIDs)
			}
			if !slices.Equal(got.MaterialIDs, tc.Expected.MaterialIDs) {
				t.Errorf("materialIDs = %v, want %v", got.MaterialIDs, tc.Expected.MaterialIDs)
			}
			if got.OutputJobCount != tc.Expected.OutputJobCount {
				t.Errorf("outputJobCount = %d, want %d\n%s", got.OutputJobCount, tc.Expected.OutputJobCount, tc.Why)
			}
			if !slices.Equal(got.LinkedJobIDs, tc.Expected.LinkedJobIDs) {
				t.Errorf("linkedJobIDs = %v, want %v", got.LinkedJobIDs, tc.Expected.LinkedJobIDs)
			}
			if !slices.Equal(got.LinkedOrderIDs, tc.Expected.LinkedOrderIDs) {
				t.Errorf("linkedOrderIDs = %v, want %v", got.LinkedOrderIDs, tc.Expected.LinkedOrderIDs)
			}
			if !slices.Equal(got.LinkedTransIDs, tc.Expected.LinkedTransIDs) {
				t.Errorf("linkedTransIDs = %v, want %v", got.LinkedTransIDs, tc.Expected.LinkedTransIDs)
			}
		})
	}
}

// The corpus covers what a group derives from its jobs. Workflow state is not
// derived at all, and resets rather than being invented: it describes progress
// at a moment nothing recorded per job.
func TestWorkflowProgressResetsRatherThanBeingInvented(t *testing.T) {
	t.Parallel()
	group := Group{GroupID: "group-1"}.RebuildFrom([]Job{{JobID: "job-1", Name: "Rifter", ItemID: 587}})

	if group.GroupStatus != 0 {
		t.Errorf("groupStatus = %d, want 0", group.GroupStatus)
	}
	if len(group.AreComplete) != 0 {
		t.Errorf("areComplete = %v, want empty", group.AreComplete)
	}
	if len(group.ArchivedJobIDs) != 0 {
		t.Errorf("archivedJobIDs = %v, want empty", group.ArchivedJobIDs)
	}
	if !group.ShowComplete || group.GroupType != 1 {
		t.Errorf("defaults not applied: showComplete=%v groupType=%d", group.ShowComplete, group.GroupType)
	}
}

func jobFor(jobID, name string, itemID int, parents []string) Job {
	return Job{JobID: jobID, Name: name, ItemID: itemID, ParentJobs: parents}
}

// A group that survived the archive keeps everything the user set on it; only
// the added jobs' own contributions are folded in.
func TestAddJobsKeepsWhatTheGroupOwns(t *testing.T) {
	t.Parallel()
	existing := Group{
		GroupID:         "group-1",
		GroupName:       "Rifter run",
		GroupStatus:     2,
		ShowComplete:    false,
		AreComplete:     []string{"job-live"},
		IncludedJobIDs:  []string{"job-live", "job-archived"},
		ArchivedJobIDs:  []string{"job-archived"},
		IncludedTypeIDs: []int{587},
		MaterialIDs:     []int{587},
		LinkedOrderIDs:  []int64{22},
		OutputJobCount:  1,
	}

	restored := jobFor("job-archived", "Tritanium", 34, []string{"job-live"})
	restored.Build.Materials = []JobMaterial{{TypeID: 36}}
	restored.APIOrders = []int{99}

	merged := existing.AddJobs([]Job{restored})

	if merged.GroupName != "Rifter run" || merged.GroupStatus != 2 || merged.ShowComplete {
		t.Fatalf("the group's own fields were rewritten: %+v", merged)
	}
	if !slices.Equal(merged.AreComplete, []string{"job-live"}) {
		t.Fatalf("areComplete = %v", merged.AreComplete)
	}
	if !slices.Equal(merged.IncludedJobIDs, []string{"job-live", "job-archived"}) {
		t.Fatalf("membership changed: %v", merged.IncludedJobIDs)
	}
	if len(merged.ArchivedJobIDs) != 0 {
		t.Fatalf("archivedJobIDs = %v, want the added job cleared", merged.ArchivedJobIDs)
	}
	if !slices.Equal(merged.IncludedTypeIDs, []int{34, 587}) {
		t.Fatalf("includedTypeIDs = %v", merged.IncludedTypeIDs)
	}
	if !slices.Equal(merged.MaterialIDs, []int{34, 36, 587}) {
		t.Fatalf("materialIDs = %v", merged.MaterialIDs)
	}
	if !slices.Equal(merged.LinkedOrderIDs, []int64{22, 99}) {
		t.Fatalf("linkedOrderIDs = %v", merged.LinkedOrderIDs)
	}
	// The added job has a parent, so it is not an output.
	if merged.OutputJobCount != 1 {
		t.Fatalf("outputJobCount = %d", merged.OutputJobCount)
	}
}

// A job archived while its group stayed on the planner is already a member, so
// adding it back must not list it twice.
func TestAddJobsDoesNotDuplicateMembership(t *testing.T) {
	t.Parallel()
	existing := Group{
		GroupID:        "group-1",
		IncludedJobIDs: []string{"job-a", "job-b"},
		ArchivedJobIDs: []string{"job-b"},
	}

	merged := existing.AddJobs([]Job{jobFor("job-b", "Rifter", 587, nil)})

	if !slices.Equal(merged.IncludedJobIDs, []string{"job-a", "job-b"}) {
		t.Fatalf("includedJobIDs = %v", merged.IncludedJobIDs)
	}
	if merged.OutputJobCount != 1 {
		t.Fatalf("outputJobCount = %d, want the added output counted once", merged.OutputJobCount)
	}
}
