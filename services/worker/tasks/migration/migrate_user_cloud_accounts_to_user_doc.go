package migration

import (
	"context"
	"fmt"
	"strings"
	"time"

	natscore "eve-industry-planner/shared/core/nats"
	eipmongo "eve-industry-planner/shared/mongo"
	esitasks "eve-industry-planner/worker/tasks/esi"

	"github.com/hibiken/asynq"
	"go.mongodb.org/mongo-driver/v2/bson"
	mongodriver "go.mongodb.org/mongo-driver/v2/mongo"
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

	mongo := deps.Mongo
	settingsCol := mongo.ApplicationSettings.Collection()

	var settings struct {
		UseCloudAccounts bool `bson:"userCloudAccounts"`
	}
	if err := settingsCol.FindOne(
		ctx,
		bson.M{"_id": p.AccountID, "_meta.accountID": p.AccountID},
	).Decode(&settings); err != nil {
		if err == mongodriver.ErrNoDocuments {
			return nil
		}
		return fmt.Errorf("load settings for %s: %w", p.AccountID, err)
	}

	if p.DryRun {
		return nil
	}

	now := time.Now().UTC()
	bulk := mongo.Bulk()
	bulk.UpdateOne(mongo.Users,
		bson.M{"_id": p.AccountID, "_meta.accountID": p.AccountID},
		bson.M{
			"$set": bson.M{
				"userCloudAccounts":  settings.UseCloudAccounts,
				"_meta.lastModified": now,
			},
		},
	)
	bulk.UpdateOne(mongo.ApplicationSettings,
		bson.M{"_id": p.AccountID, "_meta.accountID": p.AccountID},
		bson.M{
			"$unset": bson.M{
				"userCloudAccounts": "",
			},
			"$set": bson.M{
				"_meta.lastModified": now,
			},
		},
	)
	err := eipmongo.Retry(ctx, fmt.Sprintf("migrate userCloudAccounts %s", p.AccountID), func() error {
		_, e := bulk.RunOrdered(ctx)
		return e
	})
	if err != nil {
		return fmt.Errorf("migrate userCloudAccounts for %s: %w", p.AccountID, err)
	}

	return nil
}
