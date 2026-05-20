package statistics

import (
	"testing"
	"time"

	"eve-industry-planner/shared/models"
)

func TestSortArchivedSnapshotsNewestFirst(t *testing.T) {
	t1 := time.Date(2024, 1, 2, 0, 0, 0, 0, time.UTC)
	t2 := time.Date(2024, 6, 1, 0, 0, 0, 0, time.UTC)
	t3 := time.Date(2024, 3, 1, 0, 0, 0, 0, time.UTC)

	docs := []models.ArchivedJobStats{
		{JobID: "a", ArchivedAt: t1},
		{JobID: "b", ArchivedAt: t2},
		{JobID: "c", ArchivedAt: t3},
	}
	sortArchivedSnapshotsNewestFirst(docs)
	if docs[0].JobID != "b" || docs[1].JobID != "c" || docs[2].JobID != "a" {
		t.Fatalf("unexpected order: %+v", docs)
	}
}
