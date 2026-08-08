package documentlocks

import (
	"context"
	"maps"
	"net/http"

	"eve-industry-planner/api/helper"
	"eve-industry-planner/shared/core/documentlock"
	"eve-industry-planner/shared/logs"

	"github.com/redis/go-redis/v9"
)

// lockHandlerContext is the shared preamble state every mutating doc-lock
// handler needs: account + session identity, the parsed `{collection, docID}`
// body, the Redis client (verified non-nil), and the request context.
//
// `lockHandlerContextOK` writes the appropriate 4xx/5xx response and returns
// `ok: false` on any failure (missing account, missing session claim, bad
// body, Redis unavailable). Handlers should `return` immediately when
// `ok == false`.
type lockHandlerContext struct {
	Ctx        context.Context
	AccountID  string
	SessionID  string
	Collection string
	DocID      string
	Redis      *redis.Client
}

func lockTargetExtra(hc lockHandlerContext) map[string]any {
	return map[string]any{
		"collection": hc.Collection,
		"doc_id":     hc.DocID,
	}
}

func lockDebugExtra(hc lockHandlerContext, extra map[string]any) map[string]any {
	merged := lockTargetExtra(hc)
	if hc.AccountID != "" {
		merged["account_id"] = hc.AccountID
	}
	if hc.SessionID != "" {
		merged["session_id"] = hc.SessionID
	}
	maps.Copy(merged, extra)
	return merged
}

func respondLockUnavailable(w http.ResponseWriter, r *http.Request, metric string, hc lockHandlerContext, err error) {
	extra := lockTargetExtra(hc)
	extra["account_id"] = hc.AccountID
	helper.RespondEndpointError(w, r, http.StatusServiceUnavailable, "Locks unavailable", "document locks unavailable", documentlock.FailureUnavailable, metric, err, extra)
}

func attachLockOperationCompleted(r *http.Request, hc lockHandlerContext, operation string, statusCode int) {
	logs.AttachDebugStep(r, "lock_operation_completed", lockDebugExtra(hc, map[string]any{
		"operation":   operation,
		"status_code": statusCode,
	}))
}

func finishLockHandlerSuccessDetail(r *http.Request, operation string, statusCode int, hc lockHandlerContext, msg string, extra map[string]any) {
	if msg == "" {
		msg = "document lock " + operation
	}
	attachLockOperationCompleted(r, hc, operation, statusCode)
	detail := lockDebugExtra(hc, extra)
	detail["operation"] = operation
	detail["status_code"] = statusCode
	logs.AttachHandlerSuccessDetail(r, msg, detail)
}

func finishLockHandlerSuccess(r *http.Request, operation string, statusCode int, hc lockHandlerContext, extra map[string]any) {
	merged := lockTargetExtra(hc)
	maps.Copy(merged, extra)
	finishLockHandlerSuccessDetail(r, operation, statusCode, hc, "", merged)
}

func finishLockForceReleaseSuccess(r *http.Request, hc lockHandlerContext, out *documentlock.AcquireResult) {
	if out == nil {
		finishLockHandlerSuccess(r, "force-release", http.StatusOK, hc, nil)
		return
	}
	extra := map[string]any{
		"acquired":  true,
		"read_only": false,
	}
	finishLockHandlerSuccessDetail(r, "force-release-granted", out.StatusCode, hc, "document lock force-release granted", extra)
}

func finishLockAcquireSuccess(r *http.Request, hc lockHandlerContext, out *documentlock.AcquireResult) {
	if out == nil {
		finishLockHandlerSuccess(r, "acquire", http.StatusOK, hc, nil)
		return
	}

	operation := "acquire"
	msg := "document lock acquired"
	extra := map[string]any{
		"acquired":  true,
		"read_only": false,
	}

	if out.Payload != nil {
		if acquired, ok := out.Payload["acquired"].(bool); ok && !acquired {
			operation = "acquire-read-only"
			msg = "document lock read-only"
			extra["acquired"] = false
			extra["read_only"] = true
			if holder, ok := out.Payload["holderSessionID"].(string); ok && holder != "" {
				extra["holder_session_id"] = holder
			}
		}
	}

	finishLockHandlerSuccessDetail(r, operation, out.StatusCode, hc, msg, extra)
}

func finishLockExtendSuccess(r *http.Request, hc lockHandlerContext, out *documentlock.ExtendResult) {
	if out == nil {
		finishLockHandlerSuccess(r, "extend", http.StatusOK, hc, nil)
		return
	}

	if out.NotHolderPayload != nil {
		extra := map[string]any{
			"holding":   false,
			"read_only": false,
		}
		operation := "extend-not-holding"
		msg := "document lock extend not holding"

		if held, ok := out.NotHolderPayload["held"].(bool); ok && held {
			operation = "extend-read-only"
			msg = "document lock read-only"
			extra["read_only"] = true
			if holder, ok := out.NotHolderPayload["holderSessionID"].(string); ok && holder != "" {
				extra["holder_session_id"] = holder
			}
		}

		finishLockHandlerSuccessDetail(r, operation, out.StatusCode, hc, msg, extra)
		return
	}

	extra := map[string]any{
		"holding":         true,
		"read_only":       false,
		"extend_count":    out.ExtendCount,
		"handoff_pending": out.Extras.HandoffPending,
	}
	operation := "extend"
	msg := "document lock extended"

	switch {
	case out.Extras.CycleReset:
		extra["outcome"] = "cycle_reset"
	case out.Extras.HandoffPending:
		extra["outcome"] = "handoff_probe"
		operation = "extend-handoff-probe"
		msg = "document lock extend handoff probe"
		if out.Extras.ProbeTargetSessionID != "" {
			extra["probe_target_session_id"] = out.Extras.ProbeTargetSessionID
		}
	default:
		extra["outcome"] = "extended"
	}

	finishLockHandlerSuccessDetail(r, operation, out.StatusCode, hc, msg, extra)
}

func finishLockRequestSuccess(r *http.Request, hc lockHandlerContext, res *documentlock.RequestLockResult) {
	if res == nil {
		finishLockHandlerSuccess(r, "request", http.StatusOK, hc, nil)
		return
	}

	var operation, msg string
	extra := map[string]any{}

	switch res.StatusCode {
	case http.StatusAccepted:
		operation = "request-queued"
		msg = "document lock request queued"
		extra["outcome"] = "queued"
		extra["acquired"] = false
	case http.StatusCreated:
		operation = "request-granted"
		msg = "document lock request granted"
		extra["outcome"] = "granted_empty"
		extra["acquired"] = true
	default:
		operation = "request-same-holder"
		msg = "document lock request same holder"
		extra["outcome"] = "same_holder"
		extra["acquired"] = true
	}

	finishLockHandlerSuccessDetail(r, operation, res.StatusCode, hc, msg, extra)
}

func handoffHolderExtra(previousHolderSessionID, newHolderSessionID string) map[string]any {
	extra := map[string]any{}
	if previousHolderSessionID != "" {
		extra["previous_holder_session_id"] = previousHolderSessionID
	}
	if newHolderSessionID != "" {
		extra["new_holder_session_id"] = newHolderSessionID
	}
	return extra
}

func finishLockHandOverSuccess(r *http.Request, hc lockHandlerContext, res *documentlock.HandOverResult) {
	if res == nil {
		finishLockHandlerSuccess(r, "hand-over", http.StatusOK, hc, nil)
		return
	}

	switch res.StatusCode {
	case http.StatusNoContent:
		extra := handoffHolderExtra(res.PreviousHolderSessionID, "")
		extra["outcome"] = "released_no_queue"
		finishLockHandlerSuccessDetail(r, "hand-over-released", res.StatusCode, hc, "document lock hand-over released", extra)
	default:
		extra := handoffHolderExtra(res.PreviousHolderSessionID, res.NewHolderSessionID)
		extra["outcome"] = "promoted"
		extra["handoff_granted"] = true
		finishLockHandlerSuccessDetail(r, "hand-over-granted", res.StatusCode, hc, "document lock hand-over granted", extra)
	}
}

func finishLockClaimHandoffSuccess(r *http.Request, hc lockHandlerContext, out *documentlock.ClaimHandoffOutput) {
	extra := handoffHolderExtra(out.PreviousHolderSessionID, out.NewHolderSessionID)
	extra["handoff_granted"] = true
	extra["acquired"] = true
	finishLockHandlerSuccessDetail(r, "claim-handoff", out.Status, hc, "document lock handoff claimed", extra)
}

func attachLockHandlerClientFailure(r *http.Request, operation, logMsg, failureClass string, statusCode int, hc lockHandlerContext, extra map[string]any) {
	attachLockOperationCompleted(r, hc, operation, statusCode)
	detail := lockTargetExtra(hc)
	detail["operation"] = operation
	detail["status_code"] = statusCode
	detail["failure_class"] = failureClass
	maps.Copy(detail, extra)
	logs.AttachClientFailureDetail(r, logMsg, detail)
}

func finishLockStateSuccess(r *http.Request, operation, accountID, collection, docID string, extra map[string]any) {
	hc := lockHandlerContext{
		AccountID:  accountID,
		Collection: collection,
		DocID:      docID,
	}
	attachLockOperationCompleted(r, hc, operation, http.StatusOK)
	detail := map[string]any{
		"operation":   operation,
		"status_code": http.StatusOK,
	}
	if collection != "" {
		detail["collection"] = collection
	}
	if docID != "" {
		detail["doc_id"] = docID
	}
	maps.Copy(detail, extra)
	logs.AttachHandlerSuccessDetail(r, "document lock "+operation, detail)
}

func finishLockStateBatchSuccess(r *http.Request, accountID string, jobCount, groupCount int) {
	hc := lockHandlerContext{AccountID: accountID}
	attachLockOperationCompleted(r, hc, "lock-state-batch", http.StatusOK)
	detail := map[string]any{
		"operation":       "lock-state-batch",
		"status_code":     http.StatusOK,
		"job_doc_count":   jobCount,
		"group_doc_count": groupCount,
	}
	msg := "document lock lock-state-batch"
	logs.EmitAccessShapedLog(r.Context(), "debug", msg, detail, logs.DebugStepsFromContext(r.Context()), nil)
}

// lockHandlerContextOK gathers the standard preamble for every mutating
// doc-lock HTTP handler in this package. See `lockHandlerContext` for the
// fields. On any auth/parse/redis error the response has already been written
// to `w`; the caller just returns.
func lockHandlerContextOK(w http.ResponseWriter, r *http.Request, redisClient *redis.Client) (lockHandlerContext, bool) {
	accountID := helper.AuthenticatedAccountID(r)
	sessionID := helper.AuthenticatedSessionID(r)
	b, err := parseLockBody(r)
	if err != nil {
		helper.RespondEndpointError(w, r, http.StatusBadRequest, err.Error(), "document lock: invalid request body", documentlock.FailureBadRequest, "document_lock", err, nil)
		return lockHandlerContext{}, false
	}
	if redisClient == nil {
		helper.RespondEndpointError(w, r, http.StatusServiceUnavailable, "Locks unavailable", "document locks unavailable", documentlock.FailureUnavailable, "document_lock", nil, nil)
		return lockHandlerContext{}, false
	}
	hc := lockHandlerContext{
		Ctx:        r.Context(),
		AccountID:  accountID,
		SessionID:  sessionID,
		Collection: b.Collection,
		DocID:      b.DocID,
		Redis:      redisClient,
	}
	logs.AttachDebugStep(r, "lock_target_resolved", lockDebugExtra(hc, nil))
	return hc, true
}
