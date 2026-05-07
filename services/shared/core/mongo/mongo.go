package mongo

import (
	"context"
	"errors"
	"fmt"
	"time"

	"eve-industry-planner/shared/core/config"
	"eve-industry-planner/shared/logs"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
	"go.opentelemetry.io/contrib/instrumentation/go.mongodb.org/mongo-driver/mongo/otelmongo"
)

// Database and collection names
var (
	// DatabaseName is the name of the MongoDB database
	DatabaseName = "eve_industry_planner"

	// CollectionUsers is the name of the users collection
	CollectionUsers = "users"

	// CollectionJobs is the name of the live planner jobs collection (legacy).
	// Documents are scoped by Job.MetaData.AccountID (BSON _meta.accountID), not top-level accountID.
	CollectionJobs = "jobs"

	// CollectionUserJobDocuments is the canonical per-account live job documents collection (API + realtime).
	// Same models.Job shape as CollectionJobs; _id is jobID string.
	CollectionUserJobDocuments = "user_job_documents"

	// CollectionArchivedJobs holds jobs imported from Firestore ArchivedJobs (distinct from live planner jobs).
	// Ownership is keyed by Job.MetaData.AccountID (BSON _meta.accountID), not top-level accountID.
	CollectionArchivedJobs = "archivedJobs"

	// CollectionCorpArchivedJobs holds corporation-owned archived jobs (same models.Job shape; scoped by _meta.corpRef / _meta.corporationID).
	CollectionCorpArchivedJobs = "corp_archivedJobs"

	// CollectionBuildStats holds per-account aggregates for archived jobs that contribute to corp-linked stats.
	CollectionBuildStats = "build_stats"

	// CollectionCorpArchivedJobStats holds snapshots for archived jobs that contribute to corp-level stats
	// (pairs with corp_build_stats; former collection name: archived_job_stats).
	CollectionCorpArchivedJobStats = "corp_archived_job_stats"

	// CollectionUserArchivedJobStats holds snapshots for personal-only archived jobs (parallel to corp_* split).
	CollectionUserArchivedJobStats = "user_archived_job_stats"

	// CollectionUserBuildStats holds per-account aggregates from personal-only snapshots (parallel naming to corp_build_stats).
	CollectionUserBuildStats = "user_build_stats"

	// CollectionBuildStatsBuckets holds per-account monthly timeline buckets.
	CollectionBuildStatsBuckets = "build_stats_buckets"

	// CollectionUserBuildStatsBuckets mirrors CollectionBuildStatsBuckets for personal-only aggregates when populated.
	CollectionUserBuildStatsBuckets = "user_build_stats_buckets"

	// CollectionCorpRollupBuckets holds pre-aggregated monthly rows for corp-scoped rollup API (see models.CorpRollupMonthlyBucket).
	CollectionCorpRollupBuckets = "corp_rollup_buckets"

	// CollectionCorpBuildStats holds per-corporation lifetime aggregate rows.
	CollectionCorpBuildStats = "corp_build_stats"

	// CollectionCorpBuildStatsBuckets holds per-corporation monthly timeline buckets.
	CollectionCorpBuildStatsBuckets = "corp_build_stats_buckets"

	// CollectionCorpBuildStatsDirtyRefs tracks corp refs needing aggregate rebuild (mirror: user_build_stats_dirty_accounts).
	CollectionCorpBuildStatsDirtyRefs = "corp_build_stats_dirty_refs"

	// CollectionUserBuildStatsDirtyAccounts tracks user account IDs needing build_stats / user_build_stats rebuild from snapshots.
	CollectionUserBuildStatsDirtyAccounts = "user_build_stats_dirty_accounts"

	// CollectionCorpBuildStatsAccountRefs legacy index/cleanup only; worker no longer writes account→corp rows.
	CollectionCorpBuildStatsAccountRefs = "corp_build_stats_account_refs"

	// CollectionUserJobGroups is the per-account job groups collection (planner UI).
	CollectionUserJobGroups = "user_job_groups"

	// CollectionUserGroupTemplateCatalog is one document per account listing template summaries.
	CollectionUserGroupTemplateCatalog = "user_group_template_catalog"

	// CollectionUserGroupTemplatePayloads stores full template graphs (one document per templateID).
	CollectionUserGroupTemplatePayloads = "user_group_template_payloads"

	// CollectionUserWatchlistDeprecated is the legacy Firestore-shaped watchlist (groups + items JSON blob per account).
	CollectionUserWatchlistDeprecated = "user_watchlist_deprecated"

	// CollectionApplicationSettings is the name of the application settings collection (per-account settings document)
	CollectionApplicationSettings = "application_settings"

	// CollectionBlueprints is the static SDE blueprint recipes collection.
	CollectionBlueprints = "blueprints"

	// CollectionCitadelNames stores community-submitted citadel names keyed by structure ID.
	CollectionCitadelNames = "citadel_names"
)

// ArchivedJobsUpsertUnset clears legacy top-level keys on archivedJobs upserts. Lifecycle and
// archiveProcessed belong under _meta only; $set with models.Job does not include these roots,
// so stale values from Firestore-era documents would otherwise remain.
// CorpArchivedJobsUpsertUnset clears legacy roots on corp_archivedJobs upserts (mirror ArchivedJobsUpsertUnset).
var CorpArchivedJobsUpsertUnset = bson.M{
	"accountID":        "",
	"archiveProcessed": "",
	"archived":         "",
	"archiveTimeStamp": "",
	"deleted":          "",
	"deletedTimeStamp": "",
}

var ArchivedJobsUpsertUnset = bson.M{
	"accountID":        "",
	"archiveProcessed": "",
	"archived":         "",
	"archiveTimeStamp": "",
	"deleted":          "",
	"deletedTimeStamp": "",
}

// UserJobDocumentsUpsertUnset clears legacy top-level keys on user_job_documents (same as PUT /api/v1/job-documents).
var UserJobDocumentsUpsertUnset = bson.M{
	"accountID":        "",
	"archived":         "",
	"archiveTimeStamp": "",
	"archiveProcessed": "",
	"deleted":          "",
	"deletedTimeStamp": "",
}

// connectMongo is a generic connection function that establishes a MongoDB client
// with the provided URL and connection options builder function
func connectMongo(mongoURL string, connectionName string, configureOpts func(*options.ClientOptions)) (*mongo.Client, error) {
	retryCount := 5
	retryDelay := 5 * time.Second
	bg := context.Background()

	for i := 0; i < retryCount; i++ {
		// Start with URI, then apply additional options
		opts := options.Client().ApplyURI(mongoURL)
		// Apply additional configuration
		configureOpts(opts)

		client, err := mongo.Connect(bg, opts)
		if err == nil {
			// Verify connection by pinging
			ctx, cancel := context.WithTimeout(bg, 5*time.Second)
			err = client.Ping(ctx, nil)
			cancel()

			if err == nil {
				i++
				message := fmt.Sprintf("Connected to %s on attempt %d/%d", connectionName, i, retryCount)
				logs.DebugCtx(bg, message)

				// Start background monitoring for connection health
				go monitorMongoConnection(client)

				return client, nil
			}
			// If ping failed, close client and retry
			_ = client.Disconnect(bg)
		}
		i++
		message := fmt.Sprintf("Failed to connect to %s. Attempt %d/%d. Error: %v", connectionName, i, retryCount, err)
		logs.ErrorCtx(bg, message)
		time.Sleep(retryDelay)
	}

	message := fmt.Sprintf("Failed to connect to %s after %d attempts. Exiting...", connectionName, retryCount)
	logs.ErrorCtx(bg, message)
	return nil, errors.New(message)
}

// ConnectPrimary establishes a client connection to the primary MongoDB instance
func ConnectPrimary() (*mongo.Client, error) {
	cfg, err := config.LoadConfig()
	if err != nil {
		return nil, err
	}

	// Configure MongoDB client with reconnection settings for primary
	configureOpts := func(opts *options.ClientOptions) {
		opts.SetConnectTimeout(10 * time.Second)
		opts.SetServerSelectionTimeout(10 * time.Second)
		opts.SetSocketTimeout(10 * time.Second)
		opts.SetHeartbeatInterval(10 * time.Second)
		opts.SetMaxPoolSize(10) // Match IncomingPoolSize (10 workers) to allow full concurrent DB operations
		opts.SetMinPoolSize(1)  // Minimal warm pool, scales automatically up to MaxPoolSize under load
		// Enable automatic reconnection
		opts.SetRetryWrites(true)
		opts.SetRetryReads(true)
		opts.SetMonitor(otelmongo.NewMonitor())
	}

	return connectMongo(cfg.MONGO_URL, "Mongo", configureOpts)
}

// ConnectFromMongoEnv connects using [config.MongoURLFromEnv] only (no Redis or other service env).
// Use from CLIs and one-off tools.
func ConnectFromMongoEnv() (*mongo.Client, error) {
	mongoURL, err := config.MongoURLFromEnv()
	if err != nil {
		return nil, err
	}
	configureOpts := func(opts *options.ClientOptions) {
		opts.SetConnectTimeout(10 * time.Second)
		opts.SetServerSelectionTimeout(10 * time.Second)
		opts.SetSocketTimeout(10 * time.Second)
		opts.SetHeartbeatInterval(10 * time.Second)
		opts.SetMaxPoolSize(10)
		opts.SetMinPoolSize(1)
		opts.SetRetryWrites(true)
		opts.SetRetryReads(true)
	}
	return connectMongo(mongoURL, "Mongo", configureOpts)
}

// monitorMongoConnection periodically checks MongoDB connection health and logs reconnections
func monitorMongoConnection(client *mongo.Client) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	bg := context.Background()

	for range ticker.C {
		ctx, cancel := context.WithTimeout(bg, 5*time.Second)
		err := client.Ping(ctx, nil)
		cancel()

		if err != nil {
			logs.WarnCtx(bg, "MongoDB connection health check failed, attempting reconnect", "error", err)
			// MongoDB driver will automatically reconnect on next operation
			// We just need to wait for it
			time.Sleep(2 * time.Second)
			ctx, cancel := context.WithTimeout(bg, 5*time.Second)
			if err := client.Ping(ctx, nil); err == nil {
				logs.InfoCtx(bg, "MongoDB reconnected successfully")
			}
			cancel()
		}
	}
}

func Cleanup(ctx context.Context, client *mongo.Client) {
	if client == nil {
		return
	}
	_ = client.Disconnect(ctx)
}
