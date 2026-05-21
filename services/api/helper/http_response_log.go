package helper

import (
	"net/http"

	"eve-industry-planner/shared/logs"
)

// RespondEndpointError writes an HTTP error and attaches fields for consolidated request logging.
// For status >= 500 uses [logs.AttachServerFailureDetail]; for 4xx uses [logs.AttachClientFailureDetail].
func RespondEndpointError(w http.ResponseWriter, r *http.Request, statusCode int, publicMsg, logMsg, failureClass, metric string, err error, extra map[string]interface{}) {
	detail := endpointFailureDetail(failureClass, metric, extra)
	if statusCode >= http.StatusInternalServerError {
		logs.AttachServerFailureDetail(r, logMsg, err, detail)
	} else if statusCode >= http.StatusBadRequest {
		logs.AttachClientFailureDetail(r, logMsg, detail)
	}
	http.Error(w, publicMsg, statusCode)
}

// RespondEndpointServerError is [RespondEndpointError] with status 500.
func RespondEndpointServerError(w http.ResponseWriter, r *http.Request, publicMsg, logMsg, failureClass, metric string, err error, extra map[string]interface{}) {
	RespondEndpointError(w, r, http.StatusInternalServerError, publicMsg, logMsg, failureClass, metric, err, extra)
}

func endpointFailureDetail(failureClass, metric string, extra map[string]interface{}) map[string]interface{} {
	m := make(map[string]interface{}, len(extra)+2)
	if failureClass != "" {
		m["failure_class"] = failureClass
	}
	if metric != "" {
		m["metric"] = metric
	}
	for k, v := range extra {
		m[k] = v
	}
	return m
}
