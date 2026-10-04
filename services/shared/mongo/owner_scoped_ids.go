package mongo

import (
	"regexp"
	"slices"

	"eve-industry-planner/shared/models"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// OwnerScopedIDCollections hold documents whose _id carries the owner.
func OwnerScopedIDCollections() []string {
	return []string{
		CollectionJobDocuments,
		CollectionJobGroups,
		CollectionArchivedJobs,
	}
}

// NeedsOwnerScopedID reports whether a stored id in one of these collections has yet to be
// rewritten.
func NeedsOwnerScopedID(storedID string) bool {
	_, err := OwnerFromDocumentID(storedID)
	return err != nil
}

// BareDocumentIDFilter selects documents still stored under an id that names no owner.
func BareDocumentIDFilter() bson.M {
	return bson.M{"_id": bson.M{
		"$type": "string",
		"$not":  bson.Regex{Pattern: regexp.QuoteMeta(documentIDSeparator)},
	}}
}

// StoredDocumentID is the _id a document is stored under: owner-scoped in the collections that take
// one, bare everywhere else.
func StoredDocumentID(collection string, owner models.Owner, bareID string) string {
	if slices.Contains(OwnerScopedIDCollections(), collection) {
		return OwnerScopedDocumentID(owner, bareID)
	}
	return bareID
}

// SeedDocumentRevision gives a decoded document the write counter a conditional write compares,
// leaving one it already has alone.
func SeedDocumentRevision(doc bson.M) {
	meta := AsDocumentM(doc[models.MetaFieldName])
	if meta == nil {
		return
	}
	if _, ok := meta[models.MetaFieldRevision]; ok {
		return
	}
	meta[models.MetaFieldRevision] = models.InitialDocumentRevision
	doc[models.MetaFieldName] = meta
}
