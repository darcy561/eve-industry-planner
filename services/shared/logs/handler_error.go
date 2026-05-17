package logs

import (
	"context"
	"net/http"
)

// handlerFailureDetailKey stores structured fields for 5xx responses so middleware can log and
// attach Sentry context when the captured exception alone is too generic.
type handlerFailureDetailKey struct{}

// AttachHandlerFailureDetail merges detail into request context (last key wins on collision).
// Safe for nil r or empty detail.
func AttachHandlerFailureDetail(r *http.Request, detail map[string]interface{}) {
	if r == nil || len(detail) == 0 {
		return
	}
	existing, _ := r.Context().Value(handlerFailureDetailKey{}).(map[string]interface{})
	merged := make(map[string]interface{}, len(existing)+len(detail))
	for k, v := range existing {
		merged[k] = v
	}
	for k, v := range detail {
		merged[k] = v
	}
	*r = *r.WithContext(context.WithValue(r.Context(), handlerFailureDetailKey{}, merged))
}

// HandlerFailureDetailFromRequest returns detail attached with [AttachHandlerFailureDetail], if any.
func HandlerFailureDetailFromRequest(r *http.Request) map[string]interface{} {
	if r == nil {
		return nil
	}
	d, _ := r.Context().Value(handlerFailureDetailKey{}).(map[string]interface{})
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
	*r = *r.WithContext(context.WithValue(r.Context(), handlerErrorKey{}, err))
}

// HandlerErrorFromRequest returns an error attached with [AttachHandlerError], if any.
func HandlerErrorFromRequest(r *http.Request) error {
	if r == nil {
		return nil
	}
	e, _ := r.Context().Value(handlerErrorKey{}).(error)
	return e
}

// RespondHTTPError writes an HTTP error body and status. For server errors (status >= 500), a non-nil
// err is attached on r for outer middleware (for example Sentry in request logging).
func RespondHTTPError(w http.ResponseWriter, r *http.Request, statusCode int, msg string, err error) {
	if statusCode >= http.StatusInternalServerError && err != nil {
		AttachHandlerError(r, err)
	}
	http.Error(w, msg, statusCode)
}
