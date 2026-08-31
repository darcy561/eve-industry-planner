package startup

import (
	"context"
	"time"

	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"

	"go.mongodb.org/mongo-driver/v2/bson"
)

const schemaVersionReportTimeout = 60 * time.Second

// ReportSchemaVersionLag logs how many documents per collection are not at the current
// schema version (missing schemaVersion counts as not current). Watchlist is excluded.
// Failures are logged and do not return an error — intended for observability only.
func ReportSchemaVersionLag(ctx context.Context, mongoHandle *eipmongo.Mongo) {
	if mongoHandle == nil || mongoHandle.DB == nil {
		return
	}
	rctx, cancel := context.WithTimeout(ctx, schemaVersionReportTimeout)
	defer cancel()

	db := mongoHandle.DB
	targets := []struct {
		collection string
		current    int
	}{
		{eipmongo.CollectionAccounts, models.UserAccountDocumentSchemaCurrent},
		{eipmongo.CollectionAccountSettings, models.ApplicationSettingsSchemaCurrent},
		{eipmongo.CollectionAccountJobDocuments, models.JobSchemaCurrent},
		{eipmongo.CollectionAccountJobGroups, models.GroupSchemaCurrent},
		{eipmongo.CollectionAccountJobs, models.JobSchemaCurrent},
	}

	for _, t := range targets {
		filter := bson.M{
			"$or": []bson.M{
				{"schemaVersion": bson.M{"$exists": false}},
				{"schemaVersion": bson.M{"$ne": t.current}},
			},
		}
		n, err := db.Collection(t.collection).CountDocuments(rctx, filter)
		if err != nil {
			logs.WarnCtx(rctx, "schema version lag report: count failed",
				"collection", t.collection,
				"error", err)
			continue
		}
		logs.InfoCtx(rctx, "schema version lag report",
			"collection", t.collection,
			"not_at_current_version", n,
			"current_schema_version", t.current,
		)
	}
}
