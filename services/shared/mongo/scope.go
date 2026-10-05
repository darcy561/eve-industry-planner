package mongo

import (
	"maps"
	"time"

	"eve-industry-planner/shared/models"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// Field paths into the _meta block every scoped document carries, built from the keys models names
// so a filter cannot drift from the document it has to match.
const (
	FieldMetaOwner        = models.MetaFieldName + "." + models.MetaFieldOwner
	FieldMetaOwnerKind    = FieldMetaOwner + ".kind"
	FieldMetaOwnerID      = FieldMetaOwner + ".id"
	FieldMetaRevision     = models.MetaFieldName + "." + models.MetaFieldRevision
	FieldMetaLastModified = models.MetaFieldName + "." + models.MetaFieldLastModified
	FieldMetaSessionID    = models.MetaFieldName + "." + models.MetaFieldSessionID
	FieldMetaClientID     = models.MetaFieldName + "." + models.MetaFieldClientID
)

// MetaStamp is the _meta $set a write or removal stamps: when it happened, and the session and client
// that made it where they are known.
func MetaStamp(now time.Time, sessionID, wsClientID string) bson.M {
	stamp := bson.M{FieldMetaLastModified: now}
	if sessionID != "" {
		stamp[FieldMetaSessionID] = sessionID
	}
	if wsClientID != "" {
		stamp[FieldMetaClientID] = wsClientID
	}
	return stamp
}

// OwnerFilter matches what one owner holds, naming both halves so an id cannot match another kind's
// planner; any extra conditions given are added to it.
func OwnerFilter(owner models.Owner, extra ...bson.M) bson.M {
	filter := bson.M{FieldMetaOwnerKind: owner.Kind, FieldMetaOwnerID: owner.ID}
	for _, more := range extra {
		maps.Copy(filter, more)
	}
	return filter
}

// AccountDocumentFilter matches an account's own singleton document, whose _id is the account id.
func AccountDocumentFilter(accountID string) bson.M {
	return OwnerFilter(models.AccountOwner(accountID), bson.M{"_id": accountID})
}
