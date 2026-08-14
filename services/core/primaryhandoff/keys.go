// Package primaryhandoff holds Redis key contracts for core primary changeover
// data that must survive process death (e.g. changestream resume tokens).
// Namespace is expandable — add more keys under Prefix, not a single JSON blob.
package primaryhandoff

import "fmt"

const Prefix = "eip:core:handoff:v1:"

// ResumeTokenKey is the Mongo change-stream resume token for one collection group.
// Value: base64-encoded bson of the event _id (StartAfter cursor).
func ResumeTokenKey(groupID string) string {
	return fmt.Sprintf("%scs:resume:%s", Prefix, groupID)
}
