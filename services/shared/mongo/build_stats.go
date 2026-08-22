package mongo

import "fmt"

// Document _id builders for the statistics collections. These are the contract
// between the workers that write and the API that reads; build every _id here
// rather than formatting one at a call site.

// BuildStatsDocumentID is the Mongo _id for collection build_stats: accountID|typeID.
// Must stay in sync with worker archived-jobs aggregation (ProcessBuildStats).
func BuildStatsDocumentID(accountID string, typeID int) string {
	return fmt.Sprintf("%s|%d", accountID, typeID)
}

// UserRollupMonthlyDocumentID is the _id for user_rollup_buckets: accountID|typeID|YYYY-MM.
func UserRollupMonthlyDocumentID(accountID string, typeID, year, month int) string {
	return fmt.Sprintf("%s|%d|%04d-%02d", accountID, typeID, year, month)
}

// ArchivedJobStatsDocumentID is the _id for user_archived_job_stats: accountID|jobID.
func ArchivedJobStatsDocumentID(accountID, jobID string) string {
	return fmt.Sprintf("%s|%s", accountID, jobID)
}
