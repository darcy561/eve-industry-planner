package commands

import (
	"context"
	"eve-industry-planner/shared/lifecycle"
	eipnats "eve-industry-planner/shared/nats"
	"eve-industry-planner/shared/stackservices"
	"fmt"
	"strconv"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

type migrateUserCloudAccountsOptions struct {
	scanBatch int
	limit     int
	dryRun    bool
}

func runMigrateUserCloudAccountsToUserDoc(ctx context.Context, args []string) error {
	opts, err := parseMigrateUserCloudAccountsOptions(args)
	if err != nil {
		return err
	}

	clients, stopDeps, err := stackservices.Connect(ctx, stackservices.Services{Mongo: true, NATS: true})
	if err != nil {
		return err
	}
	defer lifecycle.RunCleanups(5*time.Second, stopDeps)

	if _, err := clients.NATS.Tasks.Ensure(ctx); err != nil {
		return fmt.Errorf("failed to ensure worker task stream: %w", err)
	}

	mongo := clients.Mongo
	settingsCol := mongo.ApplicationSettings.Collection()
	filter := bson.M{
		"userCloudAccounts": bson.M{"$exists": true},
	}
	findOpts := options.Find().
		SetBatchSize(int32(opts.scanBatch)).
		SetProjection(bson.M{"_id": 1, "_meta.accountID": 1}).
		SetSort(bson.D{{Key: "_id", Value: 1}})
	if opts.limit > 0 {
		findOpts.SetLimit(int64(opts.limit))
	}

	cur, err := settingsCol.Find(ctx, filter, findOpts)
	if err != nil {
		return fmt.Errorf("query settings for migrateUserCloudAccountsToUserDoc fan-out: %w", err)
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
			return fmt.Errorf("decode settings id for migrateUserCloudAccountsToUserDoc fan-out: %w", err)
		}
		accountID := strings.TrimSpace(row.MetaData.AccountID)
		if accountID == "" {
			accountID = strings.TrimSpace(row.ID)
		}
		if accountID == "" {
			continue
		}
		checked++

		if err := eipnats.PublishMigrateUserCloudAccountsToUserDoc(ctx, clients.NATS, accountID, opts.dryRun); err != nil {
			return fmt.Errorf("publish migrateUserCloudAccountsToUserDoc for %s: %w", accountID, err)
		}
		queued++
	}
	if err := cur.Err(); err != nil {
		return fmt.Errorf("iterate settings for migrateUserCloudAccountsToUserDoc fan-out: %w", err)
	}

	fmt.Printf("Queued %d migrateUserCloudAccountsToUserDoc tasks (checked=%d) on subject %q (priority=%s)\n",
		queued,
		checked,
		eipnats.MigrateUserCloudAccountsToUserDoc.Subject,
		eipnats.MigrateUserCloudAccountsToUserDoc.DefaultPriority,
	)
	return nil
}

func parseMigrateUserCloudAccountsOptions(args []string) (migrateUserCloudAccountsOptions, error) {
	opts := migrateUserCloudAccountsOptions{
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
			return opts, fmt.Errorf("unknown migrateUserCloudAccountsToUserDoc flag %q", a)
		}
	}
	return opts, nil
}
