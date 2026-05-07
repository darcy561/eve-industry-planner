package helpers

import (
	"fmt"
	"regexp"

	"go.mongodb.org/mongo-driver/bson"
)

// CorpBuildStatsPruneFilter returns a DeleteMany filter for corp_build_stats (or bucket) rows keyed by opaque corp ref prefix.
func CorpBuildStatsPruneFilter(ref string, keepIDs []string) bson.M {
	regex := fmt.Sprintf("^%s\\|", regexp.QuoteMeta(ref))
	filter := bson.M{"_id": bson.M{"$regex": regex}}
	if len(keepIDs) > 0 {
		filter["_id"] = bson.M{"$regex": regex, "$nin": keepIDs}
	}
	return filter
}
