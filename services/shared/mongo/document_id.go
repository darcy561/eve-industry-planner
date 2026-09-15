package mongo

import (
	"fmt"
	"maps"
	"strings"

	"eve-industry-planner/shared/models"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// documentIDSeparator divides the owner key from the id it scopes. The owner key
// separates its own halves with ":", so the two never collide.
const documentIDSeparator = "|"

// OwnerScopedDocumentID is the stored _id of a document belonging to one planner:
// {ownerKey}|{id}.
//
// `_id` is unique across a collection, so a bare id could exist only once and an
// upsert filtered on owner and id would insert a duplicate rather than update the
// document it meant. The owner in the id is what keeps the two in step.
//
// The bare id is what a client sends and receives; compose here and split with
// [BareDocumentID] at the boundary.
func OwnerScopedDocumentID(owner models.Owner, id string) string {
	if owner.IsZero() || id == "" {
		return ""
	}
	return owner.Key() + documentIDSeparator + id
}

// OwnerScopedDocumentIDs is [OwnerScopedDocumentID] over a list, dropping ids it
// cannot scope so a filter is never built from a partial one.
func OwnerScopedDocumentIDs(owner models.Owner, ids []string) []string {
	if owner.IsZero() || len(ids) == 0 {
		return nil
	}
	scoped := make([]string, 0, len(ids))
	for _, id := range ids {
		if scopedID := OwnerScopedDocumentID(owner, id); scopedID != "" {
			scoped = append(scoped, scopedID)
		}
	}
	return scoped
}

// BareDocumentID is the id a client knows, taken back out of a stored one.
//
// An id carrying no owner is returned unchanged: documents an account owns
// wherever it works are keyed by the account id alone, and so are the collections
// that predate owner scoping.
func BareDocumentID(storedID string) string {
	_, bare, found := strings.Cut(storedID, documentIDSeparator)
	if !found {
		return storedID
	}
	return bare
}

// SetVersionedDocument is the update for a write that replaces a document and
// counts itself.
//
// Mongo refuses to $set a subdocument and $inc a path inside it in one update —
// "would create a conflict at _meta" — and every scoped document carries its
// version inside `_meta`. So the document is marshalled, `_meta` lifted out and
// set field by field, and the version left to $inc alone.
//
// Setting `_meta` whole would also reset the counter to whatever the caller's
// struct held, which for a decoded request body is zero.
func SetVersionedDocument(doc any, unset bson.M) (bson.M, error) {
	raw, err := bson.Marshal(doc)
	if err != nil {
		return nil, fmt.Errorf("marshal document: %w", err)
	}
	var fields bson.M
	if err := bson.Unmarshal(raw, &fields); err != nil {
		return nil, fmt.Errorf("decode document: %w", err)
	}

	set := bson.M{}
	for key, value := range fields {
		if key != metaField {
			set[key] = value
			continue
		}
		// Nested documents decode as bson.D, so the meta block is walked as one
		// rather than asserted to a map.
		meta, ok := value.(bson.D)
		if !ok {
			return nil, fmt.Errorf("document %s is not a subdocument", metaField)
		}
		maps.Copy(set, MetaSetByPath(meta))
	}

	update := bson.M{
		"$set": set,
		"$inc": bson.M{FieldMetaVersion: 1},
	}
	if len(unset) > 0 {
		update["$unset"] = unset
	}
	return update, nil
}

// OwnerFromDocumentID reads the owner out of a stored id.
//
// The error names the id rather than assuming a caller can, because an id that
// does not parse is a document nothing can route.
func OwnerFromDocumentID(storedID string) (models.Owner, error) {
	key, _, found := strings.Cut(storedID, documentIDSeparator)
	if !found {
		return models.Owner{}, fmt.Errorf("document id %q carries no owner", storedID)
	}
	return models.ParseOwnerKey(key)
}

// MetaSetByPath is a `_meta` block as the field paths that set it, the version
// left out so an $inc of it in the same update has no conflict to hit.
func MetaSetByPath(meta bson.D) bson.M {
	set := bson.M{}
	for _, element := range meta {
		if element.Key == MetaFieldVersionKey {
			continue
		}
		set[metaField+"."+element.Key] = element.Value
	}
	return set
}
