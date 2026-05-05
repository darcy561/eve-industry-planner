package helper

import (
	"net/http"

	"eve-industry-planner/shared/logs"
)

// RequireMethodAndAccountID validates request method and extracts accountID.
// It records standardized metric labels when the checks fail.
func RequireMethodAndAccountID(
	w http.ResponseWriter,
	r *http.Request,
	metrics *RequestMetricsTracker,
	expectedMethod string,
) (string, bool) {
	if !RequireMethod(w, r, expectedMethod) {
		if metrics != nil {
			metrics.Error("method_not_allowed")
		}
		return "", false
	}
	accountID, ok := RequireAccountID(w, r)
	if !ok {
		if metrics != nil {
			metrics.Error("auth_error")
		}
		return "", false
	}
	return accountID, true
}

// DecodeJSONOrBadRequest decodes JSON body into target and writes standardized 400 on failure.
func DecodeJSONOrBadRequest(
	w http.ResponseWriter,
	r *http.Request,
	metrics *RequestMetricsTracker,
	target interface{},
) bool {
	if err := DecodeJSONRequest(r, target, DefaultMaxBodySize); err != nil {
		if metrics != nil {
			metrics.Error("invalid_json")
		}
		logs.RespondHTTPError(w, r, http.StatusBadRequest, err.Error(), err)
		return false
	}
	return true
}

// RespondNotFound writes a 404 response and records standardized metric label.
func RespondNotFound(w http.ResponseWriter, r *http.Request, metrics *RequestMetricsTracker) {
	if metrics != nil {
		metrics.Error("not_found")
	}
	http.NotFound(w, r)
}
