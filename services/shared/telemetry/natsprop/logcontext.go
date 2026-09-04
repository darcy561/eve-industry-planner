package natsprop

import (
	"context"
	"strings"

	"eve-industry-planner/shared/logs"

	natslib "github.com/nats-io/nats.go"
)

const (
	// HeaderRequestID mirrors HTTP X-Request-ID for cross-service correlation.
	HeaderRequestID = "X-Request-ID"
	// HeaderLogAccountID carries the originating authenticated account id.
	HeaderLogAccountID = "X-Log-Account-ID"
	// HeaderLogSessionID carries the originating session id.
	HeaderLogSessionID = "X-Log-Session-ID"
)

// InjectLogContext adds request identity fields from ctx into NATS message headers.
func InjectLogContext(ctx context.Context, h natslib.Header) {
	if ctx == nil || h == nil {
		return
	}
	if v := logs.RequestIDFromContext(ctx); v != "" {
		h.Set(HeaderRequestID, v)
	}
	if v := logs.RequestAccountIDFromContext(ctx); v != "" {
		h.Set(HeaderLogAccountID, v)
	}
	if v := logs.RequestSessionIDFromContext(ctx); v != "" {
		h.Set(HeaderLogSessionID, v)
	}
}

// LogContextFromContext serialises request identity from ctx into a string map (e.g. Asynq headers).
func LogContextFromContext(ctx context.Context) map[string]string {
	if ctx == nil {
		return nil
	}
	m := make(map[string]string, 3)
	if v := logs.RequestIDFromContext(ctx); v != "" {
		m[HeaderRequestID] = v
	}
	if v := logs.RequestAccountIDFromContext(ctx); v != "" {
		m[HeaderLogAccountID] = v
	}
	if v := logs.RequestSessionIDFromContext(ctx); v != "" {
		m[HeaderLogSessionID] = v
	}
	if len(m) == 0 {
		return nil
	}
	return m
}

func logContextFromHeaders(h natslib.Header) (requestID, accountID, sessionID string) {
	if len(h) == 0 {
		return "", "", ""
	}
	return strings.TrimSpace(h.Get(HeaderRequestID)),
		strings.TrimSpace(h.Get(HeaderLogAccountID)),
		strings.TrimSpace(h.Get(HeaderLogSessionID))
}

func logContextFromStringMap(headers map[string]string) (requestID, accountID, sessionID string) {
	if len(headers) == 0 {
		return "", "", ""
	}
	get := func(key string) string {
		return strings.TrimSpace(headers[key])
	}
	return get(HeaderRequestID), get(HeaderLogAccountID), get(HeaderLogSessionID)
}

// BindLogContext attaches request identity to ctx without overwriting existing values.
func BindLogContext(ctx context.Context, requestID, accountID, sessionID string) context.Context {
	if ctx == nil {
		ctx = context.Background()
	}
	if requestID != "" && logs.RequestIDFromContext(ctx) == "" {
		ctx = logs.WithRequestID(ctx, requestID)
	}
	if accountID != "" && logs.RequestAccountIDFromContext(ctx) == "" {
		ctx = logs.BindRequestAccountID(ctx, accountID)
	}
	if sessionID != "" && logs.RequestSessionIDFromContext(ctx) == "" {
		ctx = logs.BindRequestSessionID(ctx, sessionID)
	}
	return ctx
}

// BindLogContextFromHeaders restores request identity from NATS headers onto ctx.
func BindLogContextFromHeaders(ctx context.Context, h natslib.Header) context.Context {
	rid, aid, sid := logContextFromHeaders(h)
	return BindLogContext(ctx, rid, aid, sid)
}

// BindLogContextFromStringMap restores request identity from a flat header map (e.g. Asynq).
func BindLogContextFromStringMap(ctx context.Context, headers map[string]string) context.Context {
	rid, aid, sid := logContextFromStringMap(headers)
	return BindLogContext(ctx, rid, aid, sid)
}
