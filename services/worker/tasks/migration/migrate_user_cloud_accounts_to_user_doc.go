package migration

import (
	"context"
	"fmt"
	"strings"
	"time"

	mongocore "eve-industry-planner/shared/core/mongo"
	natscore "eve-industry-planner/shared/core/nats"
	esitasks "eve-industry-planner/worker/tasks/esi"

	"github.com/hibiken/asynq"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
)

// MigrateUserCloudAccountsToUserDoc copies userCloudAccounts from application_settings
// to users, then removes the legacy settings field.
func MigrateUserCloudAccountsToUserDoc(ctx context.Context, task *asynq.Task, deps *esitasks.TaskDependencies) error {
	if task == nil {
		return fmt.Errorf("task is nil")
	}
	if deps == nil || deps.Mongo == nil {
		return fmt.Errorf("mongo client is required")
	}

	var p natscore.MigrateUserCloudAccountsToUserDocRequest
	if len(task.Payload()) > 0 {
		payload, err := esitasks.UnmarshalTaskPayload[natscore.MigrateUserCloudAccountsToUserDocRequest](task)
		if err != nil {
			return fmt.Errorf("invalid payload: %w", err)
		}
		p = payload
	}
	p.AccountID = strings.TrimSpace(p.AccountID)
	if p.AccountID == "" {
		return fmt.Errorf("account_id is required")
	}

	db := deps.Mongo.Database(mongocore.DatabaseName)
	usersCol := db.Collection(mongocore.CollectionUsers)
	settingsCol := db.Collection(mongocore.CollectionApplicationSettings)

	var settings struct {
		UseCloudAccounts bool `bson:"userCloudAccounts"`
	}
	if err := settingsCol.FindOne(
		ctx,
		bson.M{"_id": p.AccountID, "_meta.accountID": p.AccountID},
	).Decode(&settings); err != nil {
		if err == mongo.ErrNoDocuments {
			return nil
		}
		return fmt.Errorf("load settings for %s: %w", p.AccountID, err)
	}

	if p.DryRun {
		return nil
	}

	now := time.Now().UTC()
	if _, err := usersCol.UpdateOne(
		ctx,
		bson.M{"_id": p.AccountID, "_meta.accountID": p.AccountID},
		bson.M{
			"$set": bson.M{
				"userCloudAccounts":  settings.UseCloudAccounts,
				"_meta.lastModified": now,
			},
		},
	); err != nil {
		return fmt.Errorf("update users.userCloudAccounts for %s: %w", p.AccountID, err)
	}

	if _, err := settingsCol.UpdateOne(
		ctx,
		bson.M{"_id": p.AccountID, "_meta.accountID": p.AccountID},
		bson.M{
			"$unset": bson.M{
				"userCloudAccounts": "",
			},
			"$set": bson.M{
				"_meta.lastModified": now,
			},
		},
	); err != nil {
		return fmt.Errorf("unset settings.userCloudAccounts for %s: %w", p.AccountID, err)
	}

	return nil
}
