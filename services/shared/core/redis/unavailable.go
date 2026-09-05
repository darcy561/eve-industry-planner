package redis

import (
	"context"
	"errors"
	"net"
	"strings"

	"github.com/redis/go-redis/v9"
)

// IsUnavailableError reports whether err indicates Redis is unreachable.
// Missing keys (redis.Nil) and request cancellation are not treated as unavailable.
func IsUnavailableError(err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, redis.Nil) {
		return false
	}
	if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
		return false
	}
	if errors.Is(err, redis.ErrClosed) {
		return true
	}
	if _, ok := errors.AsType[net.Error](err); ok {
		return true
	}
	if _, ok := errors.AsType[*net.OpError](err); ok {
		return true
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "dial tcp") ||
		strings.Contains(msg, "no such host") ||
		strings.Contains(msg, "connection refused") ||
		strings.Contains(msg, "connection reset") ||
		strings.Contains(msg, "i/o timeout") ||
		strings.Contains(msg, "redis unavailable") ||
		strings.Contains(msg, "redis client is nil") ||
		strings.Contains(msg, "an error has occurred with redis command")
}
