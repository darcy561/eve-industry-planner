package logs

import (
	"context"
	"strings"

	"go.uber.org/zap"
)

type requestIDKey struct{}

// WithRequestID stores the HTTP request id (or generated id) on ctx for log correlation and NATS propagation.
func WithRequestID(ctx context.Context, requestID string) context.Context {
	requestID = strings.TrimSpace(requestID)
	if ctx == nil || requestID == "" {
		return ctx
	}
	ctx = context.WithValue(ctx, requestIDKey{}, requestID)
	if l, ok := ctx.Value(LoggerKey{}).(*zap.Logger); ok && l != nil {
		ctx = ContextWithLogger(ctx, l.With(zap.String("request_id", requestID)))
	}
	return ctx
}

// RequestIDFromContext returns the request id when middleware or handlers bound it.
func RequestIDFromContext(ctx context.Context) string {
	if ctx == nil {
		return ""
	}
	v, _ := ctx.Value(requestIDKey{}).(string)
	return strings.TrimSpace(v)
}
