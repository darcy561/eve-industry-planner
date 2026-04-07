package logs

// RequestStartTimeKey is the context key for storing the request start time (see [RequestStartTime]).
type RequestStartTimeKey struct{}

// LoggerKey is the context key for a request-scoped *zap.Logger (see [FromContext]).
type LoggerKey struct{}
