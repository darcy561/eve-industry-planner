package mongo

import (
	"regexp"
	"slices"

	"eve-industry-planner/shared/models"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// OwnerScopedIDCollections hold documents whose _id carries the owner.
//
// A planner-held document's id must state its owner, because _id is unique
// across a collection: a bare id could exist only once, so the same job id in two
// planners would collide. See [OwnerScopedDocumentID].
//
// The account's own singleton documents are not here. Their _id is the account
// id, which already names the only owner they can have.
func OwnerScopedIDCollections() []string {
	return []string{
		CollectionJobDocuments,
		CollectionJobGroups,
		CollectionArchivedJobs,
	}
}

// The group template collections belong here too, and are absent until they
// carry an owner block at all: the rewrite reads a document's owner to build its
// new id, so listing them now would skip every row while the release gate went
// on failing over the same ones. They join when the owner block does.

// NeedsOwnerScopedID reports whether a stored id in one of these collections has
// yet to be rewritten.
//
// The test is the id itself rather than a flag: an id that already names its
// owner is done, which is what makes the rewrite idempotent and its remaining
// work countable.
func NeedsOwnerScopedID(storedID string) bool {
	_, err := OwnerFromDocumentID(storedID)
	return err != nil
}

// RewrittenDocumentID is the id a document moves to, or empty when it is already
// there.
func RewrittenDocumentID(owner models.Owner, storedID string) string {
	if !NeedsOwnerScopedID(storedID) {
		return ""
	}
	return OwnerScopedDocumentID(owner, storedID)
}

// BareDocumentIDFilter selects documents still stored under an id that names no
// owner. It is what the rewrite enumerates and what the release gates on, so
// both agree on what "not yet moved" means.
//
// $not takes a regex literal rather than a $regex document, which the server
// refuses.
func BareDocumentIDFilter() bson.M {
	return bson.M{"_id": bson.M{
		"$type": "string",
		"$not":  bson.Regex{Pattern: regexp.QuoteMeta(documentIDSeparator)},
	}}
}

// StoredDocumentID is the _id a document is stored under: owner-scoped in the
// collections that take one, bare everywhere else.
//
// For a writer that addresses documents across collections — schema maintenance,
// the entity-ref sweep — so it cannot build a bare id for a scoped collection and
// upsert a second copy of a document it meant to update.
func StoredDocumentID(collection string, owner models.Owner, bareID string) string {
	if slices.Contains(OwnerScopedIDCollections(), collection) {
		return OwnerScopedDocumentID(owner, bareID)
	}
	return bareID
}

// SeedDocumentRevision gives a decoded document the write counter a conditional
// write compares, leaving one it already has alone.
//
// The shared client sets DefaultDocumentM, so a nested document arrives as
// bson.M — but a caller that decoded it another way hands over a bson.D. Reading
// it through AsDocumentM takes either, because asserting one shape seeds nothing
// when the other turns up, and silently: every migrated document would arrive
// without the revision a conditional write compares.
func SeedDocumentRevision(doc bson.M) {
	meta := AsDocumentM(doc[metaField])
	if meta == nil {
		return
	}
	if _, ok := meta[MetaFieldRevisionKey]; ok {
		return
	}
	meta[MetaFieldRevisionKey] = models.InitialDocumentRevision
	doc[metaField] = meta
}
