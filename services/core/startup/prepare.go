package startup

import (
	"context"
	"eve-industry-planner/shared/stackservices"
	"fmt"

	mongoindex "eve-industry-planner/shared/core/mongo/indexing"
	"eve-industry-planner/shared/lifecycle"
	"eve-industry-planner/shared/logs"
)

// Prepare runs required sync startup, then kicks warn-continue background checks.
func Prepare(ctx context.Context, clients *stackservices.Clients) error {
	if err := EnsureMongoIndexes(ctx, clients); err != nil {
		return err
	}
	Background(ctx, clients)
	return nil
}

// EnsureMongoIndexes is fail-closed: unique/query indexes must exist before core work starts.
func EnsureMongoIndexes(ctx context.Context, clients *stackservices.Clients) error {
	if clients == nil || clients.Mongo == nil {
		return fmt.Errorf("startup: mongo client required for index ensure")
	}
	return mongoindex.EnsureIndexes(ctx, clients.Mongo)
}

// Background starts fire-and-forget startup reports (warn-continue).
func Background(ctx context.Context, clients *stackservices.Clients) {
	if clients == nil {
		return
	}
	lifecycle.GoCtx(ctx, func(c context.Context) {
		ReportSchemaVersionLag(c, clients.Mongo)
	})
	lifecycle.GoCtx(ctx, func(c context.Context) {
		if err := CheckRefreshTokenKeyringCoverage(c, clients); err != nil {
			logs.WarnCtx(c, "refresh token keyring startup check failed (continuing)", "error", err)
		}
	})
}
