package migration

import (
	"context"
	"fmt"
	"strings"
	"time"

	"eve-industry-planner/shared/core/config"
	mongocore "eve-industry-planner/shared/core/mongo"
	natscore "eve-industry-planner/shared/core/nats"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/models"
	esitasks "eve-industry-planner/worker/tasks/esi"

	"github.com/hibiken/asynq"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
)

// EncryptCloudRefreshTokensBatch encrypts legacy plaintext `refreshTokens[].rToken` rows
// for one account that has cloud storage enabled. Intended for fan-out backfill (asynq).
func EncryptCloudRefreshTokensBatch(ctx context.Context, task *asynq.Task, deps *esitasks.TaskDependencies) error {
	if task == nil {
		return fmt.Errorf("task is nil")
	}
	if deps == nil || deps.Mongo == nil {
		return fmt.Errorf("mongo client is required")
	}

	var p natscore.EncryptCloudRefreshTokensRequest
	if len(task.Payload()) > 0 {
		payload, err := esitasks.UnmarshalTaskPayload[natscore.EncryptCloudRefreshTokensRequest](task)
		if err != nil {
			return fmt.Errorf("invalid payload: %w", err)
		}
		p = payload
	}
	p.AccountID = strings.TrimSpace(p.AccountID)
	if p.AccountID == "" {
		return fmt.Errorf("account_id is required")
	}

	tokenCfg, err := config.LoadCloudStoredESIKeys()
	if err != nil {
		return err
	}
	if tokenCfg.Keyring == nil {
		return fmt.Errorf("REFRESH_TOKEN_AES_KEY not configured")
	}

	db := deps.Mongo.Database(mongocore.DatabaseName)
	usersCol := db.Collection(mongocore.CollectionUsers)

	var doc models.UserAccountDocument
	if err := usersCol.FindOne(ctx, bson.M{"_id": p.AccountID, "_meta.accountID": p.AccountID}).Decode(&doc); err != nil {
		if err == mongo.ErrNoDocuments {
			return nil
		}
		return fmt.Errorf("load user for encryptCloudRefreshTokensBatch %s: %w", p.AccountID, err)
	}

	if !doc.UserCloudAccounts {
		return nil
	}

	dirty := false
	for i := range doc.RefreshTokens {
		rt := &doc.RefreshTokens[i]
		if rt.RToken == "" {
			continue
		}
		plain := rt.RToken
		if err := rt.EncryptRefreshAtRest(plain, tokenCfg.Keyring); err != nil {
			logs.WarnCtx(ctx, "encrypt refresh migration: encrypt row failed",
				"account_id", p.AccountID,
				"character_hash", rt.CharacterHash,
				"error", err,
			)
			continue
		}
		dirty = true
	}
	if !dirty || p.DryRun {
		return nil
	}

	_, err = usersCol.UpdateOne(ctx, bson.M{"_id": p.AccountID, "_meta.accountID": p.AccountID}, bson.M{
		"$set": bson.M{
			"refreshTokens":      doc.RefreshTokens,
			"_meta.lastModified": time.Now().UTC(),
		},
	})
	if err != nil {
		logs.WarnCtx(ctx, "encrypt refresh migration: update failed",
			"account_id", p.AccountID,
			"error", err,
		)
		return err
	}
	return nil
}
