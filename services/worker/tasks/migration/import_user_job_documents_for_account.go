package migration

import (
	"context"
	"errors"
	"fmt"
	"time"

	natscore "eve-industry-planner/shared/core/nats"
	"eve-industry-planner/shared/firebaseadmin"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/migration/firestoremig"
	esitasks "eve-industry-planner/worker/tasks/esi"

	"github.com/hibiken/asynq"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/trace"
)

// ImportUserJobDocumentsForAccount imports live Firestore job documents referenced by
// JobSnapshot, GroupData, and Mongo user_job_groups into user_job_documents.
func ImportUserJobDocumentsForAccount(ctx context.Context, task *asynq.Task, deps *esitasks.TaskDependencies) error {
	if task == nil {
		return fmt.Errorf("task is nil")
	}
	if deps == nil || deps.Mongo == nil {
		return fmt.Errorf("mongo client is required")
	}

	req, err := esitasks.UnmarshalTaskPayload[natscore.ImportUserJobDocumentsForAccountRequest](task)
	if err != nil {
		return fmt.Errorf("invalid task data: %w", err)
	}
	if req.AccountID == "" {
		return fmt.Errorf("account_id is required")
	}

	if span := trace.SpanFromContext(ctx); span.IsRecording() {
		span.SetAttributes(attribute.String("account_id", req.AccountID))
	}

	maxAge, skip := loginRecencyWindowFromRequest(req)
	if !skip {
		include, err := firebaseadmin.AccountHasAuthActivitySince(ctx, req.AccountID, maxAge)
		if err != nil {
			if errors.Is(err, context.Canceled) {
				return err
			}
			logs.ErrorCtx(ctx, "import user job documents for account: auth recency", "account_id", req.AccountID, "error", err)
			return err
		}
		if !include {
			logs.InfoCtx(ctx, "import user job documents for account: skipped (outside login recency or no Auth user)", "account_id", req.AccountID)
			return nil
		}
	}

	fs, err := firebaseadmin.GetFirestoreClient(ctx)
	if err != nil {
		return fmt.Errorf("get firestore client: %w", err)
	}

	imp, miss, fail, lerr := firestoremig.ImportAllReferencedUserJobDocumentsForAccount(ctx, fs, deps.Mongo, req.AccountID)
	logs.InfoCtx(ctx, "import user job documents for account",
		"account_id", req.AccountID,
		"imported", imp,
		"missing_in_firestore", miss,
		"failed", fail,
	)
	if lerr != nil {
		logs.ErrorCtx(ctx, "import user job documents for account", "account_id", req.AccountID, "error", lerr)
		return lerr
	}
	return nil
}

// loginRecencyWindowFromRequest maps ImportUserJobDocumentsForAccountRequest.LoginRecencyMaxAgeSeconds to a max age for
// AccountHasAuthActivitySince, and whether the check should be skipped entirely.
// -1: skip. 0: default server window. >0: that many seconds.
func loginRecencyWindowFromRequest(req natscore.ImportUserJobDocumentsForAccountRequest) (maxAge time.Duration, skip bool) {
	switch {
	case req.LoginRecencyMaxAgeSeconds == -1:
		return 0, true
	case req.LoginRecencyMaxAgeSeconds > 0:
		return time.Duration(req.LoginRecencyMaxAgeSeconds) * time.Second, false
	default:
		return firebaseadmin.DefaultRecencyForActiveAccounts, false
	}
}
