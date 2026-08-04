package commands

import (
	"context"
	"eve-industry-planner/shared/lifecycle"
	"eve-industry-planner/shared/stackservices"
	"fmt"
	"strconv"
	"strings"
	"time"

	natscore "eve-industry-planner/shared/core/nats"
	taskscore "eve-industry-planner/shared/tasks"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

type encryptCloudRefreshTokenMigrationOptions struct {
	scanBatch int
	limit     int
	dryRun    bool
}

func runEncryptCloudRefreshTokensMigration(ctx context.Context, args []string) error {
	opts, err := parseEncryptCloudRefreshTokenMigrationOptions(args)
	if err != nil {
		return err
	}

	clients, stopDeps, err := stackservices.Connect(ctx, stackservices.Services{Mongo: true, NATS: true})
	if err != nil {
		return err
	}
	defer lifecycle.RunCleanups(5*time.Second, stopDeps)

	if err := natscore.EnsureWorkerTaskStream(clients.JetStream); err != nil {
		return fmt.Errorf("failed to ensure worker task stream: %w", err)
	}

	mongo := clients.Mongo
	usersCol := mongo.Users.Collection()
	filter := bson.M{
		"userCloudAccounts": true,
		"refreshTokens": bson.M{
			"$elemMatch": bson.M{
				"rToken": bson.M{"$exists": true, "$nin": bson.A{"", nil}},
			},
		},
	}
	findOpts := options.Find().
		SetBatchSize(int32(opts.scanBatch)).
		SetProjection(bson.M{"_id": 1, "_meta.accountID": 1}).
		SetSort(bson.D{{Key: "_id", Value: 1}})
	if opts.limit > 0 {
		findOpts.SetLimit(int64(opts.limit))
	}
	cur, err := usersCol.Find(ctx, filter, findOpts)
	if err != nil {
		return fmt.Errorf("query users for encryptCloudRefreshTokensBatch fan-out: %w", err)
	}
	defer cur.Close(ctx)

	queued := 0
	checked := 0
	for cur.Next(ctx) {
		var row struct {
			ID       string `bson:"_id"`
			MetaData struct {
				AccountID string `bson:"accountID"`
			} `bson:"_meta"`
		}
		if err := cur.Decode(&row); err != nil {
			return fmt.Errorf("decode user id for encryptCloudRefreshTokensBatch fan-out: %w", err)
		}
		accountID := strings.TrimSpace(row.MetaData.AccountID)
		if accountID == "" {
			accountID = strings.TrimSpace(row.ID)
		}
		if accountID == "" {
			continue
		}
		checked++

		payload := natscore.EncryptCloudRefreshTokensRequest{
			AccountID: accountID,
			DryRun:    opts.dryRun,
		}
		if err := natscore.PublishTask(
			ctx,
			clients.JetStream,
			taskscore.EncryptCloudRefreshTokensBatch.Subject,
			taskscore.EncryptCloudRefreshTokensBatch.Name,
			payload,
			clients.NATS,
			taskscore.EncryptCloudRefreshTokensBatch.DefaultPriority,
		); err != nil {
			return fmt.Errorf("publish encryptCloudRefreshTokensBatch for %s: %w", accountID, err)
		}
		queued++
	}
	if err := cur.Err(); err != nil {
		return fmt.Errorf("iterate users for encryptCloudRefreshTokensBatch fan-out: %w", err)
	}

	fmt.Printf("Queued %d encryptCloudRefreshTokensBatch tasks (checked=%d) on subject %q (priority=%s)\n",
		queued,
		checked,
		taskscore.EncryptCloudRefreshTokensBatch.Subject,
		taskscore.EncryptCloudRefreshTokensBatch.DefaultPriority,
	)
	return nil
}

func parseEncryptCloudRefreshTokenMigrationOptions(args []string) (encryptCloudRefreshTokenMigrationOptions, error) {
	opts := encryptCloudRefreshTokenMigrationOptions{
		scanBatch: 200,
	}
	for i := 0; i < len(args); i++ {
		a := strings.TrimSpace(args[i])
		switch {
		case strings.HasPrefix(a, "--scan-batch-size="):
			v := strings.TrimSpace(strings.TrimPrefix(a, "--scan-batch-size="))
			n, err := strconv.Atoi(v)
			if err != nil || n <= 0 {
				return opts, fmt.Errorf("invalid --scan-batch-size %q (must be > 0)", v)
			}
			opts.scanBatch = n
		case a == "--scan-batch-size":
			if i+1 >= len(args) {
				return opts, fmt.Errorf("missing value for --scan-batch-size")
			}
			i++
			n, err := strconv.Atoi(strings.TrimSpace(args[i]))
			if err != nil || n <= 0 {
				return opts, fmt.Errorf("invalid --scan-batch-size %q (must be > 0)", args[i])
			}
			opts.scanBatch = n
		case strings.HasPrefix(a, "--limit="):
			v := strings.TrimSpace(strings.TrimPrefix(a, "--limit="))
			n, err := strconv.Atoi(v)
			if err != nil || n < 0 {
				return opts, fmt.Errorf("invalid --limit %q (must be >= 0)", v)
			}
			opts.limit = n
		case a == "--limit":
			if i+1 >= len(args) {
				return opts, fmt.Errorf("missing value for --limit")
			}
			i++
			n, err := strconv.Atoi(strings.TrimSpace(args[i]))
			if err != nil || n < 0 {
				return opts, fmt.Errorf("invalid --limit %q (must be >= 0)", args[i])
			}
			opts.limit = n
		case a == "--dry-run":
			opts.dryRun = true
		default:
			return opts, fmt.Errorf("unknown encryptCloudRefreshTokensMigration flag %q", a)
		}
	}
	return opts, nil
}
