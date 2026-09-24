package jobdocuments

import (
	"slices"
	"testing"

	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"
)

func jobDocumentID(job models.Job) string { return job.JobID }

func sentJobs(ids ...string) []models.Job {
	jobs := make([]models.Job, 0, len(ids))
	for _, id := range ids {
		jobs = append(jobs, models.Job{JobID: id})
	}
	return jobs
}

// A batch answers with one refusal, so the response cannot be read as naming
// every document that missed. What wrote is stated rather than inferred.
func TestWrittenJobIDsLeavesOutEveryDocumentThatMissed(t *testing.T) {
	written := writtenIDs(
		sentJobs("job-clean", "job-moved", "job-invalid"),
		jobDocumentID,
		[]string{"job-invalid"},
		[]eipmongo.RevisionConflict{{JobID: "job-moved"}},
	)

	if !slices.Equal(written, []string{"job-clean"}) {
		t.Fatalf("written = %v, want only job-clean", written)
	}
}

func TestWrittenJobIDsNamesTheWholeBatchWhenNothingMissed(t *testing.T) {
	written := writtenIDs(sentJobs("job-1", "job-2"), jobDocumentID, nil, nil)

	if !slices.Equal(written, []string{"job-1", "job-2"}) {
		t.Fatalf("written = %v, want both", written)
	}
}

// A job carrying no id is not written and cannot be named, so it is left out
// rather than reported as an empty document that landed.
func TestWrittenJobIDsLeavesOutAJobWithNoID(t *testing.T) {
	written := writtenIDs(sentJobs("", "job-1"), jobDocumentID, []string{""}, nil)

	if !slices.Equal(written, []string{"job-1"}) {
		t.Fatalf("written = %v, want only job-1", written)
	}
}
