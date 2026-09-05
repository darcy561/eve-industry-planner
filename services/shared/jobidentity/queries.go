package jobidentity

import (
	"slices"

	eipmongo "eve-industry-planner/shared/mongo"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// Collections carry job documents, so they carry job identity.
func Collections() []string {
	return []string{
		eipmongo.CollectionJobDocuments,
		eipmongo.CollectionArchivedJobs,
		eipmongo.CollectionJobs,
	}
}

func SupportedCollection(name string) bool {
	return slices.Contains(Collections(), name)
}

// RawIDFilter matches documents still holding an entity id in the clear.
// linkedJobs.corporation_id is the only such field persisted historically.
func RawIDFilter() bson.M {
	return bson.M{"build.costs.linkedJobs.corporation_id": bson.M{"$exists": true}}
}

// StaleSpecFilter matches documents converted under an older field set, which is
// how a document picks up fields added to the declaration after it was written.
func StaleSpecFilter() bson.M {
	return bson.M{"protected.spec": bson.M{"$ne": string(Declaration.Spec)}}
}

// AccountWorkFilter matches every document for accountID needing conversion.
func AccountWorkFilter(accountID string) bson.M {
	return bson.M{
		"_meta.accountID": accountID,
		"$or":             []any{RawIDFilter(), StaleSpecFilter()},
	}
}
