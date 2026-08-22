package mongo

import (
	"go.mongodb.org/mongo-driver/v2/bson"
)

// ArchivedJobAccountFilter scopes archived jobs to _meta.accountID.
func ArchivedJobAccountFilter(accountID string) bson.M {
	return bson.M{"_meta.accountID": accountID}
}
