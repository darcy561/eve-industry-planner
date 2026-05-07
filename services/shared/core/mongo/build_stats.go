package mongo

import "fmt"

// BuildStatsDocumentID is the Mongo _id for build_stats and user_build_stats: accountID|typeID.
// Must stay in sync with worker ProcessDirtyAccountBuildStats (rebuild from snapshots).
func BuildStatsDocumentID(accountID string, typeID int) string {
	return fmt.Sprintf("%s|%d", accountID, typeID)
}

func BuildStatsBucketDocumentID(accountID string, typeID, year, month int) string {
	return fmt.Sprintf("%s|%d|%04d-%02d", accountID, typeID, year, month)
}

func CorpBuildStatsDocumentID(corpRef string, typeID int) string {
	return fmt.Sprintf("%s|%d", corpRef, typeID)
}

func CorpBuildStatsBucketDocumentID(corpRef string, typeID, year, month int) string {
	return fmt.Sprintf("%s|%d|%04d-%02d", corpRef, typeID, year, month)
}

// CorpRollupMonthlyDocumentID is Mongo _id for corp_rollup_buckets: corpRef|lane|typeID|YYYY-MM (lane is ~ or accountID).
func CorpRollupMonthlyDocumentID(corpRef, lane string, typeID, year, month int) string {
	return fmt.Sprintf("%s|%s|%d|%04d-%02d", corpRef, lane, typeID, year, month)
}

// ArchivedJobStatsDocumentID is the Mongo _id for corp_archived_job_stats and user_archived_job_stats: accountID|jobID.
func ArchivedJobStatsDocumentID(accountID, jobID string) string {
	return fmt.Sprintf("%s|%s", accountID, jobID)
}

// CorpOwnedArchivedJobStatsDocumentID is the Mongo _id for corp-owned snapshot rows: corpRef|jobID (same opaque ref as corp_build_stats).
func CorpOwnedArchivedJobStatsDocumentID(corpRef, jobID string) string {
	return fmt.Sprintf("%s|%s", corpRef, jobID)
}
