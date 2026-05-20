package commands

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"strconv"
	"strings"
	"time"

	authzhmac "eve-industry-planner/shared/core/crypto/authzhmac/helper"
	mongocore "eve-industry-planner/shared/core/mongo"
	"eve-industry-planner/shared"
	"eve-industry-planner/shared/models"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo/options"
)

func runInspectCorpBuildStats(ctx context.Context, args []string) error {
	fs := flag.NewFlagSet("inspectCorpBuildStats", flag.ContinueOnError)
	fs.Usage = func() {
		fmt.Fprintf(fs.Output(), "Usage: tasks inspectCorpBuildStats -corp <corporation_id> [flags]\n\n")
		fs.PrintDefaults()
	}
	corpID := fs.String("corp", "", "required corporation ID (numeric)")
	typeID := fs.Int("type-id", 0, "optional typeID filter")
	bucketLimit := fs.Int("bucket-limit", 24, "max monthly bucket rows to return (0 = all)")
	if err := fs.Parse(args); err != nil {
		return err
	}
	corpIDTrim := strings.TrimSpace(*corpID)
	if corpIDTrim == "" {
		return fmt.Errorf("inspectCorpBuildStats: -corp is required")
	}
	corpIDInt, err := strconv.ParseInt(corpIDTrim, 10, 64)
	if err != nil || corpIDInt <= 0 {
		return fmt.Errorf("inspectCorpBuildStats: -corp must be a positive integer")
	}

	h, err := authzhmac.NewFromEnv()
	if err != nil {
		return err
	}
	corpRef, err := h.RefFromCorporationID(corpIDInt)
	if err != nil {
		return err
	}

	clients, err := shared.ConnectServices(ctx, shared.ServiceMongo)
	if err != nil {
		return err
	}
	defer runImmediateCleanups(clients.CleanupFns...)
	db := clients.Mongo.Database(mongocore.DatabaseName)

	statsColl := db.Collection(mongocore.CollectionCorpBuildStats)
	bucketsColl := db.Collection(mongocore.CollectionCorpBuildStatsBuckets)
	dirtyColl := db.Collection(mongocore.CollectionCorpBuildStatsDirtyRefs)
	filter := bson.M{"corpRef": corpRef}
	if *typeID > 0 {
		filter["typeID"] = *typeID
	}

	ctxOp, cancel := context.WithTimeout(ctx, 2*time.Minute)
	defer cancel()

	var lifetimeRows []models.CorpBuildStatsRow
	cur, err := statsColl.Find(ctxOp, filter, options.Find().SetSort(bson.D{{Key: "typeID", Value: 1}}))
	if err != nil {
		return fmt.Errorf("find corp build stats: %w", err)
	}
	if err := cur.All(ctxOp, &lifetimeRows); err != nil {
		_ = cur.Close(ctxOp)
		return fmt.Errorf("decode corp build stats: %w", err)
	}
	_ = cur.Close(ctxOp)

	var bucketRows []models.CorpBuildStatsTimelineBucket
	bucketOpts := options.Find().SetSort(bson.D{{Key: "year", Value: -1}, {Key: "month", Value: -1}, {Key: "typeID", Value: 1}})
	if *bucketLimit > 0 {
		bucketOpts.SetLimit(int64(*bucketLimit))
	}
	cur, err = bucketsColl.Find(ctxOp, filter, bucketOpts)
	if err != nil {
		return fmt.Errorf("find corp build stats buckets: %w", err)
	}
	if err := cur.All(ctxOp, &bucketRows); err != nil {
		_ = cur.Close(ctxOp)
		return fmt.Errorf("decode corp build stats buckets: %w", err)
	}
	_ = cur.Close(ctxOp)

	dirty := false
	if err := dirtyColl.FindOne(ctxOp, bson.M{"_id": corpRef}).Err(); err == nil {
		dirty = true
	}
	out := struct {
		CorporationID       int64                               `json:"corporationID"`
		CorpRef             string                              `json:"corpRef"`
		TypeIDFilter        int                                 `json:"typeIDFilter,omitempty"`
		DirtyQueued         bool                                `json:"dirtyQueued"`
		LifetimeRows        []models.CorpBuildStatsRow          `json:"lifetimeRows"`
		BucketRows          []models.CorpBuildStatsTimelineBucket `json:"bucketRows"`
	}{
		CorporationID:       corpIDInt,
		CorpRef:             corpRef,
		TypeIDFilter:        *typeID,
		DirtyQueued:         dirty,
		LifetimeRows:        lifetimeRows,
		BucketRows:          bucketRows,
	}
	b, err := json.MarshalIndent(out, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal output: %w", err)
	}
	fmt.Println(string(b))
	return nil
}
