package mongo

import (
	"context"
	"fmt"
	"time"

	"eve-industry-planner/shared/models"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// UpsertUserAccount writes users with _meta-preserving upsert (mongo.Users).
// If clientID is set and the first write fails, retries once with empty _meta.clientID.
func (d *Docs) UpsertUserAccount(ctx context.Context, accountID string, doc models.UserAccountDocument) (*mongo.UpdateResult, bool, error) {
	if _, err := d.requireColl(); err != nil || accountID == "" {
		return nil, false, fmt.Errorf("UpsertUserAccount: invalid arguments")
	}
	doUpsert := func(ud models.UserAccountDocument) (*mongo.UpdateResult, error) {
		return d.UpsertStructPreservingMeta(ctx, ud, accountID)
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

// refreshTokenRowFields is the $set / $unset for one refreshTokens element, written under the
// positional operator.
func refreshTokenRowFields(row models.RefreshToken) (bson.M, bson.M) {
	set := bson.M{}
	unset := bson.M{}

	if row.RTokenCiphertext != "" {
		set["refreshTokens.$.rTokenCiphertext"] = row.RTokenCiphertext
		set["refreshTokens.$.rTokenNonce"] = row.RTokenNonce
		set["refreshTokens.$.rTokenKeyVersion"] = row.RTokenKeyVersion
		set["refreshTokens.$.tokenFormatVersion"] = row.TokenFormatVersion
		unset["refreshTokens.$.rToken"] = ""
	} else if row.RToken != "" {
		set["refreshTokens.$.rToken"] = row.RToken
	}

	if row.CloudMaintRefreshFailures > 0 {
		set["refreshTokens.$.cloudMaintRefreshFailures"] = row.CloudMaintRefreshFailures
	} else {
		unset["refreshTokens.$.cloudMaintRefreshFailures"] = ""
	}

	return set, unset
}

// PatchUserRefreshTokenRows writes each given refreshTokens element in place, matched by its
// CharacterHash, in one bulk write.
func (d *Docs) PatchUserRefreshTokenRows(ctx context.Context, accountID string, rows []models.RefreshToken, opts ...RetryOption) error {
	coll, err := d.requireColl()
	if err != nil || accountID == "" {
		return fmt.Errorf("PatchUserRefreshTokenRows: collection and accountID are required")
	}
	if len(rows) == 0 {
		return nil
	}

	writes := make([]mongo.WriteModel, 0, len(rows)+1)
	for _, row := range rows {
		if row.CharacterHash == "" {
			return fmt.Errorf("PatchUserRefreshTokenRows: CharacterHash is required on every row")
		}
		set, unset := refreshTokenRowFields(row)
		update := bson.M{}
		if len(set) > 0 {
			update["$set"] = set
		}
		if len(unset) > 0 {
			update["$unset"] = unset
		}
		if len(update) == 0 {
			continue
		}
		writes = append(writes, mongo.NewUpdateOneModel().
			SetFilter(userRefreshTokenRowFilter(accountID, row.CharacterHash)).
			SetUpdate(update))
	}
	if len(writes) == 0 {
		return nil
	}
	rowWrites := int64(len(writes))
	writes = append(writes, mongo.NewUpdateOneModel().
		SetFilter(AccountDocumentFilter(accountID)).
		SetUpdate(bson.M{"$set": bson.M{FieldMetaLastModified: time.Now().UTC()}}))

	opName := applyRetryOptions("PatchUserRefreshTokenRows", opts)
	return Retry(ctx, opName, func() error {
		res, err := coll.BulkWrite(ctx, writes, options.BulkWrite().SetOrdered(false))
		if err != nil {
			return err
		}
		if want := rowWrites + 1; res.MatchedCount < want {
			return fmt.Errorf("PatchUserRefreshTokenRows: %d of %d writes matched no row for account %s",
				want-res.MatchedCount, rowWrites, accountID)
		}
		return nil
	})
}

// PushUserRefreshTokenRow adds a refreshTokens element, or replaces the existing one for that
// character. Linking a character is the only write that grows the array.
func (d *Docs) PushUserRefreshTokenRow(ctx context.Context, accountID string, row models.RefreshToken, opts ...RetryOption) error {
	coll, err := d.requireColl()
	if err != nil || accountID == "" || row.CharacterHash == "" {
		return fmt.Errorf("PushUserRefreshTokenRow: collection, accountID and CharacterHash are required")
	}
	opName := applyRetryOptions("PushUserRefreshTokenRow", opts)
	return Retry(ctx, opName, func() error {
		_, err := coll.BulkWrite(ctx, []mongo.WriteModel{
			mongo.NewUpdateOneModel().
				SetFilter(userRefreshTokenRowFilter(accountID, row.CharacterHash)).
				SetUpdate(bson.M{"$set": bson.M{
					"refreshTokens.$":     row,
					FieldMetaLastModified: time.Now().UTC(),
				}}),
			mongo.NewUpdateOneModel().
				SetFilter(mergeFilters(AccountDocumentFilter(accountID), bson.M{
					"refreshTokens.CharacterHash": bson.M{"$ne": row.CharacterHash},
				})).
				SetUpdate(bson.M{
					"$push": bson.M{"refreshTokens": row},
					"$set":  bson.M{FieldMetaLastModified: time.Now().UTC()},
				}),
		}, options.BulkWrite().SetOrdered(true))
		return err
	})
}

// PullUserRefreshTokenRows removes the refreshTokens elements for the given character hashes.
func (d *Docs) PullUserRefreshTokenRows(ctx context.Context, accountID string, characterHashes []string, opts ...RetryOption) error {
	coll, err := d.requireColl()
	if err != nil || accountID == "" {
		return fmt.Errorf("PullUserRefreshTokenRows: collection and accountID are required")
	}
	if len(characterHashes) == 0 {
		return nil
	}
	opName := applyRetryOptions("PullUserRefreshTokenRows", opts)
	return Retry(ctx, opName, func() error {
		_, err := coll.UpdateOne(ctx, AccountDocumentFilter(accountID), bson.M{
			"$pull": bson.M{"refreshTokens": bson.M{"CharacterHash": bson.M{"$in": characterHashes}}},
			"$set":  bson.M{FieldMetaLastModified: time.Now().UTC()},
		})
		return err
	})
}

func userRefreshTokenRowFilter(accountID, characterHash string) bson.M {
	f := AccountDocumentFilter(accountID)
	f["refreshTokens.CharacterHash"] = characterHash
	return f
}
