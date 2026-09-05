package mongo

import (
	"context"
	"fmt"

	"eve-industry-planner/shared/models"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

// UpsertUserAccount writes users with _meta-preserving upsert (mongo.Users).
// If clientID is set and the first write fails, retries once with empty _meta.clientID.
func (d *Docs) UpsertUserAccount(ctx context.Context, accountID string, doc models.UserAccountDocument) (*mongo.UpdateResult, bool, error) {
	if _, err := d.requireColl(); err != nil || accountID == "" {
		return nil, false, fmt.Errorf("UpsertUserAccount: invalid arguments")
	}
	doUpsert := func(ud models.UserAccountDocument) (*mongo.UpdateResult, error) {
		return d.UpsertStructPreservingMetaRetry(ctx, ud, accountID)
	}
	return upsertWithWSClientIDRetry(
		doc,
		doUpsert,
		func(ud *models.UserAccountDocument) bool {
			if ud.MetaData.ClientID == "" {
				return false
			}
			ud.MetaData.ClientID = ""
			return true
		},
	)
}

// PatchUserAccountFields applies $set on the account's own document (no upsert).
func (d *Docs) PatchUserAccountFields(ctx context.Context, accountID string, set bson.M, opts ...RetryOption) error {
	coll, err := d.requireColl()
	if err != nil || accountID == "" {
		return fmt.Errorf("PatchUserAccountFields: collection and accountID are required")
	}
	if len(set) == 0 {
		return fmt.Errorf("PatchUserAccountFields: set is empty")
	}
	opName := applyRetryOptions("PatchUserAccountFields", opts)
	return Retry(ctx, opName, func() error {
		_, err := coll.UpdateOne(ctx,
			bson.M{FieldMetaOwnerKind: models.OwnerAccount, FieldMetaOwnerID: accountID, "_id": accountID},
			bson.M{"$set": set},
		)
		return err
	})
}
