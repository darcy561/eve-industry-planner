package mongo

import "fmt"

// BuildStatsDocumentID is the Mongo _id for collection build_stats: accountID|typeID.
// Must stay in sync with worker archived-jobs aggregation (ProcessBuildStats).
func BuildStatsDocumentID(accountID string, typeID int) string {
	return fmt.Sprintf("%s|%d", accountID, typeID)
}
