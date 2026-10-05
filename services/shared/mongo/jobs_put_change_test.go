package mongo

import (
	"slices"
	"testing"

	"eve-industry-planner/shared/models"
)

func TestPlanJobDeletesNamesRemovalsWithoutAJobOrARevision(t *testing.T) {
	planned, failed := planJobDeletes([]models.JobDeleteBody{
		{JobID: "kept", Revision: 4},
		{JobID: "unread"},
		{Revision: 2},
	})

	if len(planned) != 1 || planned[0].jobID != "kept" || planned[0].expected != 4 {
		t.Fatalf("planned = %+v, want only the removal read at a revision", planned)
	}
	if !slices.Equal(failed, []string{"unread", ""}) {
		t.Fatalf("failed = %v, want the two that cannot be checked", failed)
	}
}
