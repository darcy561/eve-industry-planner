package startup

import (
	"context"
	"eve-industry-planner/shared/stackservices"

	"eve-industry-planner/shared/lifecycle"
	"eve-industry-planner/shared/logs"
)

// Prepare kicks warn-continue background checks.
// Application Mongo indexes are owned by admintool dataplane.EnsureMongo (eip up/dev / ensure-mongo).
func Prepare(ctx context.Context, clients *stackservices.Clients) error {
	Background(ctx, clients)
	return nil
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
