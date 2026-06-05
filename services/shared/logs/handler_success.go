package logs

import (
	"net/http"
	"strings"
)

// HandlerCaveat is a non-fatal issue recorded during a successful handler (HTTP 2xx).
type HandlerCaveat struct {
	Key   string
	Msg   string
	Extra map[string]interface{}
}

// AttachHandlerSuccessDetail records handler outcome fields for consolidated request logging on 2xx.
// Prefer this over a separate InfoCtx at the end of the handler; middleware emits one Info or Warn line.
func AttachHandlerSuccessDetail(r *http.Request, msg string, detail map[string]interface{}) {
	if r == nil {
		return
	}
	store := failureDetailStoreFromContext(r.Context())
	if store == nil {
		return
	}
	if msg = strings.TrimSpace(msg); msg != "" {
		store.successMsg = msg
	}
	if len(detail) == 0 {
		return
	}
	merged := make(map[string]interface{}, len(detail))
	for k, v := range detail {
		merged[k] = v
	}
	enrichFailureDetailRequestIdentity(r.Context(), merged)
	if store.successDetail == nil {
		store.successDetail = merged
		return
	}
	for k, v := range merged {
		store.successDetail[k] = v
	}
}

// AttachHandlerCaveat records a non-fatal issue that should upgrade a successful request log to Warn.
func AttachHandlerCaveat(r *http.Request, key, msg string, extra map[string]interface{}) {
	if r == nil {
		return
	}
	store := failureDetailStoreFromContext(r.Context())
	if store == nil {
		return
	}
	c := HandlerCaveat{
		Key: strings.TrimSpace(key),
		Msg: strings.TrimSpace(msg),
	}
	if len(extra) > 0 {
		c.Extra = make(map[string]interface{}, len(extra))
		for k, v := range extra {
			c.Extra[k] = v
		}
		enrichFailureDetailRequestIdentity(r.Context(), c.Extra)
	}
	store.caveats = append(store.caveats, c)
}

// HandlerSuccessFromRequest returns success detail attached during a 2xx handler, if any.
func HandlerSuccessFromRequest(r *http.Request) (msg string, detail map[string]interface{}, caveats []HandlerCaveat) {
	if r == nil {
		return "", nil, nil
	}
	store := failureDetailStoreFromContext(r.Context())
	if store == nil {
		return "", nil, nil
	}
	if store.successMsg != "" {
		msg = store.successMsg
	}
	if len(store.successDetail) > 0 {
		detail = store.successDetail
	}
	if len(store.caveats) > 0 {
		caveats = append([]HandlerCaveat(nil), store.caveats...)
	}
	return msg, detail, caveats
}

// SuccessAccessLogMessage returns the log message for a completed 2xx request.
func SuccessAccessLogMessage(msg string, caveats []HandlerCaveat) string {
	if msg = strings.TrimSpace(msg); msg != "" {
		return msg
	}
	if len(caveats) > 0 {
		return "request completed with caveats"
	}
	return "request completed"
}

// HandlerCaveatsForLog formats caveats for structured access logging.
func HandlerCaveatsForLog(caveats []HandlerCaveat) []map[string]interface{} {
	if len(caveats) == 0 {
		return nil
	}
	out := make([]map[string]interface{}, len(caveats))
	for i, c := range caveats {
		m := map[string]interface{}{
			"key": c.Key,
			"msg": c.Msg,
		}
		for k, v := range c.Extra {
			m[k] = v
		}
		out[i] = m
	}
	return out
}
