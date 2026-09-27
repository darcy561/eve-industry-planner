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
func BareDocumentID(storedID string) string {
	_, bare, found := strings.Cut(storedID, documentIDSeparator)
	if !found {
		return storedID
	}
	return bare
}

// SetDocumentWithRevision is the update for a write that replaces a document and
// counts itself.
func SetDocumentWithRevision(doc any, unset bson.M) (bson.M, error) {
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
		meta, ok := value.(bson.D)
		if !ok {
			return nil, fmt.Errorf("document %s is not a subdocument", metaField)
		}
		maps.Copy(set, MetaSetByPath(meta))
	}

	update := revisionUpdate(set, unset)
	return update, nil
}

// OwnerFromDocumentID reads the owner out of a stored id.
func OwnerFromDocumentID(storedID string) (models.Owner, error) {
	key, _, found := strings.Cut(storedID, documentIDSeparator)
	if !found {
		return models.Owner{}, fmt.Errorf("document id %q carries no owner", storedID)
	}
	return models.ParseOwnerKey(key)
}

// MetaSetByPath is a `_meta` block as the field paths that set it, the revision
// left out.
func MetaSetByPath(meta any) bson.M {
	set := bson.M{}
	for key, value := range AsDocumentM(meta) {
		if key == MetaFieldRevisionKey {
			continue
		}
		set[metaField+"."+key] = value
	}
	return set
}
