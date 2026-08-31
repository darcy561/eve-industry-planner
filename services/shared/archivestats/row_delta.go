package archivestats

import (
	"maps"

	"eve-industry-planner/shared/models"
)

// ContributionOf derives what a row contributes, by folding it exactly as a
// rebuild folds every row.
//
// The folds are called rather than reimplemented: a delta that computed its own
// arithmetic could disagree with the rebuild that has to be able to reproduce it,
// and nothing would notice until the two were compared.
func ContributionOf(row models.ArchivedJobStats) models.StatsDelta {
	one := []models.ArchivedJobStats{row}

	delta := models.StatsDelta{
		Buckets: map[models.StatsBucketKey]models.StatsBucketDelta{},
		Totals:  map[models.StatsTypeKey]models.StatsTypeDelta{},
	}
	maps.Copy(delta.Buckets, AccumulateAccountBuckets(one))

	if row.Revoked {
		// A revoked row describes a job that is no longer archived; the folds skip
		// it, and so does this.
		return delta
	}

	measures := JobMeasures(row)
	var sold float64
	for _, line := range row.TransactionLines {
		sold += line.Quantity
	}
	delta.Totals[models.StatsTypeKey{TypeID: row.TypeID, Segment: JobSegment(row)}] = models.StatsTypeDelta{
		JobType:   row.JobType,
		Measures:  measures,
		SoldQty:   sold,
		BuildRows: 1,
	}
	return delta
}
