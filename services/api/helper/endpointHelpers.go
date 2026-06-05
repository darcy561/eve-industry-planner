package helper

import (
	"errors"
	"net/http"

	"eve-industry-planner/api/helper/auth"
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
	return auth.AccountIDFromContext(r.Context()), true
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
		detail := map[string]interface{}{"reason": err.Error()}
		var jsonErr *JSONRequestError
		if errors.As(err, &jsonErr) {
			if jsonErr.Detail != "" {
				detail["reason"] = jsonErr.Detail
			}
			if jsonErr.Field != "" {
				detail["field"] = jsonErr.Field
			}
			if jsonErr.Offset != 0 {
				detail["offset"] = jsonErr.Offset
			}
			if jsonErr.BodyPreview != "" {
				detail["json_preview"] = jsonErr.BodyPreview
			}
		}
		RespondEndpointError(w, r, http.StatusBadRequest, err.Error(), "invalid JSON request body", "invalid_json", "", err, detail)
		return false
	}
	return true
}

// RespondNotFound writes a 404 response and records standardized metric label.
func RespondNotFound(w http.ResponseWriter, r *http.Request, metrics *RequestMetricsTracker) {
	if metrics != nil {
		metrics.Error("not_found")
	}
	RespondEndpointError(w, r, http.StatusNotFound, "Not Found", "resource not found", "not_found", "", nil, nil)
}
