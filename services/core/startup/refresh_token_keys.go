package startup

import (
	"context"
	"eve-industry-planner/shared/stackservices"
	"fmt"
	"sort"
	"strings"

	"eve-industry-planner/shared/core/config"
	"eve-industry-planner/shared/crypto/aesgcm/keyrings"
	"eve-industry-planner/shared/logs"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// CheckRefreshTokenKeyringCoverage reports stored key versions at startup and warns on unknown versions.
func CheckRefreshTokenKeyringCoverage(ctx context.Context, clients *stackservices.Clients) error {
	if clients == nil || clients.Mongo == nil {
		return fmt.Errorf("mongo client is required for refresh token keyring startup check")
	}

	rt, err := config.LoadCloudStoredESIKeys()
	if err != nil {
		return fmt.Errorf("load refresh token keyring for startup check: %w", err)
	}
	activeVersion := rt.ActiveVersion
	supported := rt.SupportedVersions

	mongo := clients.Mongo
	col := mongo.Users.Collection()
	pipeline := mongoPipelineForRefreshTokenVersionCounts()

	cur, err := col.Aggregate(ctx, pipeline)
	if err != nil {
		return fmt.Errorf("refresh token key version startup aggregate failed: %w", err)
	}
	defer cur.Close(ctx)

	type row struct {
		Version string `bson:"_id"`
		Count   int64  `bson:"count"`
	}
	rows := make([]row, 0)
	for cur.Next(ctx) {
		var r row
		if err := cur.Decode(&r); err != nil {
			return fmt.Errorf("decode refresh token key version row: %w", err)
		}
		rows = append(rows, r)
	}
	if err := cur.Err(); err != nil {
		return fmt.Errorf("iterate refresh token key version rows: %w", err)
	}

	sort.Slice(rows, func(i, j int) bool {
		return rows[i].Version < rows[j].Version
	})

	totalEncrypted := int64(0)
	unknown := make([]row, 0)
	for _, r := range rows {
		totalEncrypted += r.Count
		if _, ok := supported[r.Version]; !ok {
			unknown = append(unknown, r)
		}
	}

	plaintextCount, err := col.CountDocuments(ctx, bson.M{
		"refreshTokens": bson.M{
			"$elemMatch": bson.M{
				"rToken": bson.M{"$exists": true, "$ne": ""},
			},
		},
	})
	if err != nil {
		return fmt.Errorf("count plaintext refresh token rows: %w", err)
	}

	logs.InfoCtx(ctx, "refresh token keyring startup check",
		"active_version", activeVersion,
		"supported_versions", keyrings.SupportedVersionList(supported),
		"encrypted_rows", totalEncrypted,
		"plaintext_docs", plaintextCount,
	)
	for _, r := range rows {
		logs.InfoCtx(ctx, "refresh token version distribution",
			"version", r.Version,
			"count", r.Count,
		)
	}

	if len(unknown) == 0 {
		return nil
	}

	unknownPairs := make([]string, 0, len(unknown))
	for _, r := range unknown {
		unknownPairs = append(unknownPairs, fmt.Sprintf("%s:%d", r.Version, r.Count))
	}
	logs.WarnCtx(ctx, "unknown refresh token key versions detected",
		"unknown_versions", strings.Join(unknownPairs, ", "),
	)
	return nil
}

func mongoPipelineForRefreshTokenVersionCounts() mongoPipeline {
	return mongoPipeline{
		{{Key: "$unwind", Value: "$refreshTokens"}},
		{{Key: "$match", Value: bson.M{
			"refreshTokens.rTokenCiphertext": bson.M{"$exists": true, "$ne": ""},
		}}},
		{{Key: "$group", Value: bson.M{
			"_id":   "$refreshTokens.rTokenKeyVersion",
			"count": bson.M{"$sum": 1},
		}}},
	}
}

type mongoPipeline []bson.D
