package logs

import (
	"context"
	"fmt"
	"maps"
	"net/http"
	"strings"
)

// ClientFailureMsgKey is the human-readable message for request-logging middleware on 4xx responses.
const ClientFailureMsgKey = "client_failure_msg"

// ServerFailureMsgKey is the human-readable message for request-logging middleware on 5xx responses.
const ServerFailureMsgKey = "server_failure_msg"

// handlerFailureDetailKey stores structured fields for 4xx/5xx responses so middleware can emit one
// combined access log (and Sentry context on 5xx) instead of a generic line plus a handler warn.
type handlerFailureDetailKey struct{}

// handlerFailureDetailStoreKey points at a request-scoped store installed by access-log middleware.
// Inner middleware (e.g. compression) may replace *http.Request; the store stays on an ancestor context.
type handlerFailureDetailStoreKey struct{}

type handlerFailureDetailStore struct {
	detail        map[string]any
	err           error
	successMsg    string
	successDetail map[string]any
	caveats       []HandlerCaveat
	debugSteps    []DebugStep
}

// WithHandlerFailureDetailStore returns ctx with a mutable failure-detail store for the request.
// Request-logging middleware should call this once per request before inner middleware runs.
func WithHandlerFailureDetailStore(ctx context.Context) context.Context {
	if failureDetailStoreFromContext(ctx) != nil {
		return ctx
	}
	return WithFreshHandlerFailureDetailStore(ctx)
}

// WithFreshHandlerFailureDetailStore installs a new log store even when ctx already has one.
// Use for nested operations (e.g. each WebSocket message) that need their own debug_steps.
func WithFreshHandlerFailureDetailStore(ctx context.Context) context.Context {
	store := &handlerFailureDetailStore{detail: make(map[string]any)}
	return context.WithValue(ctx, handlerFailureDetailStoreKey{}, store)
}

func failureDetailStoreFromContext(ctx context.Context) *handlerFailureDetailStore {
	if ctx == nil {
		return nil
	}
	s, _ := ctx.Value(handlerFailureDetailStoreKey{}).(*handlerFailureDetailStore)
	return s
}

// AttachClientFailureDetail records a 4xx failure for consolidated request logging.
// Handlers should prefer this over a separate WarnCtx when returning 4xx.
func AttachClientFailureDetail(r *http.Request, msg string, detail map[string]any) {
	attachFailureDetailWithMsg(r, ClientFailureMsgKey, msg, detail)
}

// AttachServerFailureDetail records a 5xx failure for consolidated request logging.
// Handlers should prefer this over a separate ErrorCtx when returning 5xx.
func AttachServerFailureDetail(r *http.Request, msg string, err error, detail map[string]any) {
	attachFailureDetailWithMsg(r, ServerFailureMsgKey, msg, detail)
	AttachHandlerError(r, err)
}

func attachFailureDetailWithMsg(r *http.Request, msgKey, msg string, detail map[string]any) {
	if r == nil {
		return
	}
	merged := make(map[string]any, len(detail)+1)
	maps.Copy(merged, detail)
	if strings.TrimSpace(msg) != "" {
		merged[msgKey] = msg
	}
	AttachHandlerFailureDetail(r, merged)
}

// AccessLogMessage returns the access-log message for a completed request.
func AccessLogMessage(statusCode int, detail map[string]any) string {
	if msg := failureDetailMessage(detail); msg != "" {
		return msg
	}
	if fc, ok := detail["failure_class"].(string); ok && strings.TrimSpace(fc) != "" {
		if statusCode >= 500 {
			return fmt.Sprintf("request completed with server error (%s)", fc)
		}
		if statusCode >= 400 {
			return fmt.Sprintf("request completed with client error (%s)", fc)
		}
	}
	if statusCode >= 500 {
		return "request completed with server error"
	}
	if statusCode >= 400 {
		return "request completed with client error"
	}
	return "request completed"
}

func failureDetailMessage(detail map[string]any) string {
	if detail == nil {
		return ""
	}
	for _, key := range []string{ServerFailureMsgKey, ClientFailureMsgKey} {
		if msg, ok := detail[key].(string); ok && strings.TrimSpace(msg) != "" {
			return msg
		}
	}
	return ""
}

// ClientAccessLogMessage is an alias for [AccessLogMessage] (4xx/5xx).
func ClientAccessLogMessage(statusCode int, detail map[string]any) string {
	return AccessLogMessage(statusCode, detail)
}

// AttachHandlerFailureDetail merges detail into request context (last key wins on collision).
// Safe for nil r or empty detail.
func AttachHandlerFailureDetail(r *http.Request, detail map[string]any) {
	if r == nil || len(detail) == 0 {
		return
	}
	enrichFailureDetailRequestIdentity(r.Context(), detail)
	if store := failureDetailStoreFromContext(r.Context()); store != nil {
		mergeHandlerFailureDetailMap(store, detail)
		return
	}
	existing, _ := r.Context().Value(handlerFailureDetailKey{}).(map[string]any)
	merged := mergeHandlerFailureDetailMaps(existing, detail)
	*r = *r.WithContext(context.WithValue(r.Context(), handlerFailureDetailKey{}, merged))
}

func mergeHandlerFailureDetailMap(store *handlerFailureDetailStore, detail map[string]any) {
	if store == nil || len(detail) == 0 {
		return
	}
	if store.detail == nil {
		store.detail = make(map[string]any, len(detail))
	}
	maps.Copy(store.detail, detail)
}

func mergeHandlerFailureDetailMaps(existing, detail map[string]any) map[string]any {
	merged := make(map[string]any, len(existing)+len(detail))
	maps.Copy(merged, existing)
	maps.Copy(merged, detail)
	return merged
}

// HandlerFailureDetailFromRequest returns detail attached with [AttachHandlerFailureDetail], if any.
func HandlerFailureDetailFromRequest(r *http.Request) map[string]any {
	if r == nil {
		return nil
	}
	if store := failureDetailStoreFromContext(r.Context()); store != nil && len(store.detail) > 0 {
		return store.detail
	}
	d, _ := r.Context().Value(handlerFailureDetailKey{}).(map[string]any)
	return d
}

// handlerErrorKey stores the error that caused an HTTP 5xx so outer middleware (e.g. Sentry)
// can capture the root cause. Prefer [RespondHTTPError] for responses; it calls [AttachHandlerError]
// when status is a server error (>= 500) and err is non-nil.
type handlerErrorKey struct{}

// AttachHandlerError records err on the request context in place so middleware that still holds
// *http.Request after the handler returns can read it via [HandlerErrorFromRequest].
// Safe to call with nil err (no-op).
func AttachHandlerError(r *http.Request, err error) {
	if r == nil || err == nil {
		return
	}
	if store := failureDetailStoreFromContext(r.Context()); store != nil {
		store.err = err
		return
	}
	*r = *r.WithContext(context.WithValue(r.Context(), handlerErrorKey{}, err))
}

// HandlerErrorFromRequest returns an error attached with [AttachHandlerError], if any.
func HandlerErrorFromRequest(r *http.Request) error {
	if r == nil {
		return nil
	}
	if store := failureDetailStoreFromContext(r.Context()); store != nil && store.err != nil {
		return store.err
	}
	e, _ := r.Context().Value(handlerErrorKey{}).(error)
	return e
}

// RespondHTTPError writes an HTTP error body and status. For server errors (status >= 500), a non-nil
// err is attached on r for outer middleware (for example Sentry in request logging).
// Prefer [RespondHTTPServerError] when returning 500 with structured handler_failure detail.
func RespondHTTPError(w http.ResponseWriter, r *http.Request, statusCode int, msg string, err error) {
	if statusCode >= http.StatusInternalServerError && err != nil {
		AttachHandlerError(r, err)
	}
	http.Error(w, msg, statusCode)
}

// RespondHTTPServerError writes a 500, attaches logMsg + detail for middleware, and records err for Sentry.
func RespondHTTPServerError(w http.ResponseWriter, r *http.Request, publicMsg, logMsg string, err error, detail map[string]any) {
	AttachServerFailureDetail(r, logMsg, err, detail)
	http.Error(w, publicMsg, http.StatusInternalServerError)
}
