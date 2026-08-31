package dependency

import (
	"context"
	"errors"
	"net"
	"strings"

	"eve-industry-planner/shared/core/documentlock"
	rediscore "eve-industry-planner/shared/core/redis"
	eipnats "eve-industry-planner/shared/nats"

	"go.mongodb.org/mongo-driver/v2/mongo"
)

// IsUnavailable reports whether err indicates a backing service (Redis, MongoDB, NATS)
// is temporarily unreachable. Application-level outcomes such as missing documents,
// redis.Nil, or client request cancellation are not treated as unavailable.
func IsUnavailable(err error) bool {
	if err == nil {
		return false
	}
	if isRequestContextError(err) {
		return false
	}
	if rediscore.IsUnavailableError(err) {
		return true
	}
	if isMongoUnavailable(err) {
		return true
	}
	if eipnats.IsRetryable(err) {
		return true
	}
	if errors.Is(err, documentlock.ErrLocksUnavailable) {
		return true
	}
	if isNetInfrastructure(err) {
		return true
	}
	return hasInfrastructureMessage(err.Error())
}

func isRequestContextError(err error) bool {
	return errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded)
}

func isMongoUnavailable(err error) bool {
	if errors.Is(err, mongo.ErrClientDisconnected) {
		return true
	}
	if errors.Is(err, mongo.ErrNoDocuments) || errors.Is(err, mongo.ErrNilDocument) {
		return false
	}
	if mongo.IsNetworkError(err) {
		return true
	}
	if mongo.IsTimeout(err) {
		return true
	}
	return false
}

func hasInfrastructureMessage(msg string) bool {
	msg = strings.ToLower(msg)
	if msg == "" {
		return false
	}
	if strings.Contains(msg, "mongo client") && strings.Contains(msg, "nil") {
		return true
	}
	if strings.Contains(msg, "locks unavailable") {
		return true
	}
	return isNetworkMessage(msg)
}

func isNetworkMessage(msg string) bool {
	return strings.Contains(msg, "dial tcp") ||
		strings.Contains(msg, "no such host") ||
		strings.Contains(msg, "connection refused") ||
		strings.Contains(msg, "connection reset") ||
		strings.Contains(msg, "i/o timeout") ||
		strings.Contains(msg, "server selection error") ||
		strings.Contains(msg, "connection closed")
}

func isNetInfrastructure(err error) bool {
	if _, ok := errors.AsType[net.Error](err); ok {
		return true
	}
	_, ok := errors.AsType[*net.OpError](err)
	return ok
}
