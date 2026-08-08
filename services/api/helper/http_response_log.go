package helper

import (
	"context"
	"errors"
	"maps"
	"net/http"

	"eve-industry-planner/shared/dependency"
	"eve-industry-planner/shared/logs"
)

// RespondEndpointError writes an HTTP error and attaches fields for consolidated request logging.
// For status >= 500 uses [logs.AttachServerFailureDetail]; for 4xx uses [logs.AttachClientFailureDetail].
// Client disconnect or request deadline on a server-error path is downgraded to 408 Request Timeout.
// Backing-service outages (Redis, MongoDB, NATS) on a server-error path become 503 Service Unavailable.
func RespondEndpointError(w http.ResponseWriter, r *http.Request, statusCode int, publicMsg, logMsg, failureClass, metric string, err error, extra map[string]any) {
	if statusCode >= http.StatusInternalServerError {
		switch {
		case isRequestContextError(err):
			statusCode = http.StatusRequestTimeout
			publicMsg = "Request canceled"
		case dependency.IsUnavailable(err):
			statusCode = http.StatusServiceUnavailable
			publicMsg = "Service temporarily unavailable"
		}
	}
	detail := endpointFailureDetail(failureClass, metric, extra)
	if statusCode >= http.StatusInternalServerError && statusCode != http.StatusServiceUnavailable {
		logs.AttachServerFailureDetail(r, logMsg, err, detail)
	} else if statusCode >= http.StatusBadRequest {
		logs.AttachClientFailureDetail(r, logMsg, detail)
	}
	http.Error(w, publicMsg, statusCode)
}

// RespondEndpointServerError is [RespondEndpointError] with status 500.
func RespondEndpointServerError(w http.ResponseWriter, r *http.Request, publicMsg, logMsg, failureClass, metric string, err error, extra map[string]any) {
	RespondEndpointError(w, r, http.StatusInternalServerError, publicMsg, logMsg, failureClass, metric, err, extra)
}

func isRequestContextError(err error) bool {
	return err != nil && (errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded))
}

func endpointFailureDetail(failureClass, metric string, extra map[string]any) map[string]any {
	m := make(map[string]any, len(extra)+2)
	if failureClass != "" {
		m["failure_class"] = failureClass
	}
	if metric != "" {
		m["metric"] = metric
	}
	maps.Copy(m, extra)
	return m
}
