package v1endpoints

import (
	"net/http"

	"eve-industry-planner/api/helper/auth"
	"eve-industry-planner/shared/logs"
)

func authClientFailureDetail(metric, failureClass string, extra map[string]interface{}) map[string]interface{} {
	out := map[string]interface{}{"metric": metric}
	if failureClass != "" {
		out["failure_class"] = failureClass
	}
	for k, v := range extra {
		out[k] = v
	}
	return out
}

func attachAuthLoginClientFailure(r *http.Request, logMsg, failureClass string, extra map[string]interface{}) {
	logs.AttachClientFailureDetail(r, logMsg, authClientFailureDetail("eve_token_login", failureClass, extra))
}

func attachSessionRefreshClientFailure(r *http.Request, credLog auth.RefreshCredentialLogDetail, logMsg, failureClass string, extra map[string]interface{}) {
	logs.AttachClientFailureDetail(r, logMsg, credLog.ClientFailureDetail(failureClass, extra))
}

func attachLogoutClientFailure(r *http.Request, credLog auth.RefreshCredentialLogDetail, logMsg, failureClass string, extra map[string]interface{}) {
	logs.AttachClientFailureDetail(r, logMsg, credLog.ClientFailureDetail(failureClass, extra))
}

func respondAuthLoginClientError(w http.ResponseWriter, r *http.Request, statusCode int, publicMsg, logMsg, failureClass string, extra map[string]interface{}) {
	attachAuthLoginClientFailure(r, logMsg, failureClass, extra)
	http.Error(w, publicMsg, statusCode)
}

func respondSessionRefreshClientError(w http.ResponseWriter, r *http.Request, credLog auth.RefreshCredentialLogDetail, statusCode int, publicMsg, logMsg, failureClass string, extra map[string]interface{}) {
	attachSessionRefreshClientFailure(r, credLog, logMsg, failureClass, extra)
	http.Error(w, publicMsg, statusCode)
}

func respondLogoutClientError(w http.ResponseWriter, r *http.Request, credLog auth.RefreshCredentialLogDetail, statusCode int, publicMsg, logMsg, failureClass string, extra map[string]interface{}) {
	attachLogoutClientFailure(r, credLog, logMsg, failureClass, extra)
	http.Error(w, publicMsg, statusCode)
}
